-- Additive reviewed registry creation. No legacy profile is backfilled, merged,
-- linked, deleted or treated as the result of a historical reviewed request.
CREATE TABLE registry_creation_receipts (
 id TEXT PRIMARY KEY NOT NULL,
 kind TEXT NOT NULL CONSTRAINT registry_creation_kind CHECK(kind IN ('student','guardian')),
 school_id TEXT NOT NULL REFERENCES schools(id),
 created_by TEXT NOT NULL REFERENCES users(id),
 profile_id TEXT NOT NULL,
 reason TEXT NOT NULL CONSTRAINT registry_creation_reason CHECK(length(reason) BETWEEN 10 AND 500 AND instr(reason,char(0))=0),
 request_hash TEXT NOT NULL CONSTRAINT registry_creation_hash CHECK(length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
 profile_snapshot TEXT NOT NULL CONSTRAINT registry_creation_snapshot CHECK(json_valid(profile_snapshot) AND json_type(profile_snapshot)='object'),
 created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX registry_creation_receipts_profile ON registry_creation_receipts(profile_id);
CREATE INDEX registry_creation_receipts_actor_time ON registry_creation_receipts(school_id,created_by,created_at);

CREATE TRIGGER registry_creation_authority BEFORE INSERT ON registry_creation_receipts
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM users actor JOIN schools school ON school.id=actor.school_id
  WHERE actor.id=NEW.created_by AND actor.school_id=NEW.school_id AND actor.role='admin'
   AND actor.disabled_at IS NULL AND coalesce(actor.identity_issuer,'')<>'' AND coalesce(actor.identity_subject,'')<>''
 ) THEN RAISE(ABORT,'saha_registry_creation_conflict') END;
 -- Short character-set pattern plus exact separators stays within D1's
 -- pattern limit while retaining the complete canonical UUID shape check.
 SELECT CASE WHEN length(NEW.id)<>36
  OR substr(NEW.id,9,1)<>'-' OR substr(NEW.id,14,1)<>'-' OR substr(NEW.id,19,1)<>'-' OR substr(NEW.id,24,1)<>'-'
  OR length(replace(NEW.id,'-',''))<>32 OR replace(NEW.id,'-','') GLOB '*[^0-9a-f]*'
  OR length(NEW.profile_id)<>36 OR coalesce(NEW.created_at,'')=''
  OR json_extract(NEW.profile_snapshot,'$.id') IS NOT NEW.profile_id
  OR json_extract(NEW.profile_snapshot,'$.schoolId') IS NOT NEW.school_id
  OR coalesce(json_type(NEW.profile_snapshot,'$.userId'),'')<>'null'
  OR json_extract(NEW.profile_snapshot,'$.createdAt') IS NOT NEW.created_at
  OR json_extract(NEW.profile_snapshot,'$.updatedAt') IS NOT NEW.created_at
 THEN RAISE(ABORT,'saha_registry_creation_conflict') END;
 SELECT CASE WHEN NEW.kind='student' AND (
  (SELECT count(*) FROM json_each(NEW.profile_snapshot))<>10
  OR coalesce(json_type(NEW.profile_snapshot,'$.firstName'),'')<>'text' OR json_extract(NEW.profile_snapshot,'$.firstName')=''
  OR coalesce(json_type(NEW.profile_snapshot,'$.lastName'),'')<>'text' OR json_extract(NEW.profile_snapshot,'$.lastName')=''
  OR coalesce(json_type(NEW.profile_snapshot,'$.dateOfBirth'),'')<>'text' OR json_extract(NEW.profile_snapshot,'$.dateOfBirth')=''
  OR coalesce(json_type(NEW.profile_snapshot,'$.admissionNumber'),'')<>'text' OR json_extract(NEW.profile_snapshot,'$.admissionNumber')=''
  OR coalesce(json_type(NEW.profile_snapshot,'$.gradeLevel'),'')<>'text' OR json_extract(NEW.profile_snapshot,'$.gradeLevel')=''
 ) THEN RAISE(ABORT,'saha_registry_creation_conflict') END;
 SELECT CASE WHEN NEW.kind='guardian' AND (
  (SELECT count(*) FROM json_each(NEW.profile_snapshot))<>9
  OR coalesce(json_type(NEW.profile_snapshot,'$.name'),'')<>'text' OR json_extract(NEW.profile_snapshot,'$.name')=''
  OR coalesce(json_type(NEW.profile_snapshot,'$.relationship'),'')<>'text' OR json_extract(NEW.profile_snapshot,'$.relationship')=''
  OR coalesce(json_type(NEW.profile_snapshot,'$.phone'),'') NOT IN ('null','text')
  OR coalesce(json_type(NEW.profile_snapshot,'$.email'),'') NOT IN ('null','text')
 ) THEN RAISE(ABORT,'saha_registry_creation_conflict') END;
END;
CREATE TRIGGER registry_creation_commit AFTER INSERT ON registry_creation_receipts
BEGIN
 INSERT INTO students(id,user_id,school_id,first_name,last_name,date_of_birth,admission_number,grade_level,created_at,updated_at)
 SELECT NEW.profile_id,NULL,NEW.school_id,json_extract(NEW.profile_snapshot,'$.firstName'),json_extract(NEW.profile_snapshot,'$.lastName'),
  json_extract(NEW.profile_snapshot,'$.dateOfBirth'),json_extract(NEW.profile_snapshot,'$.admissionNumber'),json_extract(NEW.profile_snapshot,'$.gradeLevel'),NEW.created_at,NEW.created_at
 WHERE NEW.kind='student';
 SELECT CASE WHEN NEW.kind='student' AND changes()<>1 THEN RAISE(ABORT,'saha_registry_creation_conflict') END;
 INSERT INTO guardians(id,school_id,user_id,name,phone,email,relationship,created_at,updated_at)
 SELECT NEW.profile_id,NEW.school_id,NULL,json_extract(NEW.profile_snapshot,'$.name'),json_extract(NEW.profile_snapshot,'$.phone'),
  json_extract(NEW.profile_snapshot,'$.email'),json_extract(NEW.profile_snapshot,'$.relationship'),NEW.created_at,NEW.created_at
 WHERE NEW.kind='guardian';
 SELECT CASE WHEN NEW.kind='guardian' AND changes()<>1 THEN RAISE(ABORT,'saha_registry_creation_conflict') END;
END;
CREATE TRIGGER registry_creation_receipts_no_update BEFORE UPDATE ON registry_creation_receipts
BEGIN SELECT RAISE(ABORT,'Registry creation receipts are immutable'); END;
CREATE TRIGGER registry_creation_receipts_no_delete BEFORE DELETE ON registry_creation_receipts
BEGIN SELECT RAISE(ABORT,'Registry creation receipts are immutable'); END;
