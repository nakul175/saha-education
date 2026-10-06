CREATE TABLE curriculum_references (
  id TEXT PRIMARY KEY NOT NULL,
  school_id TEXT NOT NULL REFERENCES schools(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX curriculum_references_school_author ON curriculum_references(school_id, author_id);
CREATE TABLE curriculum_reference_versions (
  id TEXT PRIMARY KEY NOT NULL,
  reference_id TEXT NOT NULL REFERENCES curriculum_references(id),
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  curriculum TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  subject TEXT NOT NULL,
  language TEXT NOT NULL,
  objectives TEXT NOT NULL,
  body TEXT NOT NULL,
  rights_statement TEXT NOT NULL,
  source_reference TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  CONSTRAINT curriculum_versions_positive CHECK(typeof(version) = 'integer' AND version BETWEEN 1 AND 1000000),
  CONSTRAINT curriculum_versions_rights CHECK(length(trim(rights_statement)) BETWEEN 1 AND 2000),
  CONSTRAINT curriculum_versions_body CHECK(length(trim(body)) BETWEEN 1 AND 20000),
  CONSTRAINT curriculum_versions_approval_pair CHECK((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX curriculum_versions_reference_number ON curriculum_reference_versions(reference_id, version);
CREATE TABLE resource_reference_bindings (
  id TEXT PRIMARY KEY NOT NULL,
  resource_id TEXT NOT NULL REFERENCES teaching_resources(id),
  resource_version_id TEXT NOT NULL REFERENCES resource_versions(id),
  reference_id TEXT NOT NULL REFERENCES curriculum_references(id),
  reference_version_id TEXT NOT NULL REFERENCES curriculum_reference_versions(id),
  selected_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX resource_reference_bindings_resource_version ON resource_reference_bindings(resource_version_id);
CREATE INDEX resource_reference_bindings_source ON resource_reference_bindings(reference_version_id);
