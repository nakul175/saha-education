// Slice 10j: a small message catalogue for the education workspace screens (BR-UX-05), with no dependency.
// English is the default and the fallback. Each entry is [English, Hindi]; a missing or blank Hindi string falls back to
// the English one, so an untranslated key can never show a blank label. Hindi is a DRAFT translation: no qualified translator
// has reviewed it (NFR-15 stays unverified) and every Hindi screen says so.
//
// What is never translated: data values (names, villages, programme names, notes, identifiers, dates and
// numbers, which keep Western digits), clinical rule text from protocols, and record contents. Measurement units and
// duration words that follow a value (mmHg, kg, °C, UTC, weeks, days, years) stay as written.

export type Language = 'en' | 'hi';
export const LANGUAGES: readonly Language[] = ['en', 'hi'];
export const DEFAULT_LANGUAGE: Language = 'en';
export const LANGUAGE_NAME: Record<Language, string> = { en: 'English', hi: 'हिन्दी' };
export type Params = Record<string, string | number>;

type Entry = readonly [en: string, hi?: string];

// UI messages for education domain (mapped from health terms)
export const CATALOGUE = {
  // ---- Shared notices and labels -------------------------------------------------------------------------------------
  'common.draftNotice': ['This Hindi text is a draft translation. A qualified translator has not reviewed it.', 'यह हिंदी पाठ मसौदा अनुवाद है। किसी योग्य अनुवादक ने इसकी समीक्षा नहीं की है।'],
  'common.recordedNotice': ['Names, values, notes and protocol text are shown exactly as recorded.', 'नाम, मान, नोट्स और प्रोटोकॉल का पाठ जैसा दर्ज है वैसा ही दिखाया जाता है।'],
  'common.partialNotice': ['Some panels on this screen are still in English.', 'इस स्क्रीन के कुछ पैनल अभी अंग्रेज़ी में हैं।'],
  'common.untranslatedNotice': ['This screen is not translated yet and is shown in English.', 'यह स्क्रीन अभी अनूदित नहीं है और अंग्रेज़ी में दिखाई गई है।'],
  'common.choose': ['Choose…', 'चुनें…'],
  'common.noticeLabel': ['Translation notice', 'अनुवाद सूचना'],
  'common.state.accepted': ['accepted', 'स्वीकार किया गया'],
  'common.state.uncertain': ['uncertain', 'अनिश्चित'],
  'common.state.rejected': ['rejected', 'अस्वीकार किया गया'],
  'common.state.cancelled': ['cancelled', 'रद्द'],
  'common.state.queued': ['queued', 'कतार में'],
  'common.state.sending': ['sending', 'भेजा जा रहा है'],
  'common.state.retryable': ['retryable', 'पुनः प्रयास योग्य'],
  'common.state.draft': ['draft', 'ड्राफ़्ट'],
  'common.state.confirmed': ['confirmed', 'पुष्ट'],
  'role.admin': ['Administrator', 'प्रशासक'],
  'role.teacher': ['Teacher', 'शिक्षक'],
  'role.guardian': ['Guardian', 'अभिभावक'],
  'role.student': ['Student', 'छात्र'],

  // ---- Navigation, top bar, banners, footer and the language choice --------------------------------------------------
  'nav.work': ['My work', 'मेरा कार्य'],
  'nav.students': ['Students', 'छात्र'],
  'nav.guardians': ['Guardians', 'अभिभावक'],
  'nav.schools': ['Schools', 'स्कूल'],
  'nav.classes': ['Classes', 'कक्षाएं'],
  'nav.courses': ['Courses', 'पाठ्यक्रम'],
  'nav.enrolments': ['Enrolments', 'पंजीकरण'],
  'nav.attendance': ['Attendance', 'उपस्थिति'],
  'nav.assessments': ['Assessments', 'मूल्यांकन'],
  'nav.reportCards': ['Report Cards', 'रिपोर्ट कार्ड'],
  'nav.notifications': ['Notifications', 'सूचनाएं'],
  'nav.workspaceLabel': ['EDUCATION WORKSPACE', 'शिक्षा कार्यक्षेत्र'],
  'nav.caption': ['YOUR WORKSPACE', 'आपका कार्यक्षेत्र'],
  'nav.noteLine1': ['One student.', 'एक छात्र।'],
  'nav.noteLine2': ['Every class, in view.', 'हर कक्षा, एक नज़र में।'],
  'nav.organisationLabel': ['SCHOOL', 'स्कूल'],
  'nav.chooseOrganisation': ['Current school', 'वर्तमान स्कूल'],
  'nav.owner': ['Owner', 'स्वामी'],
  'nav.signedInAs': ['Signed in as {name}', '{name} के रूप में साइन इन'],
  'nav.signedAccount': ['Signed-in account', 'साइन इन किया हुआ खाता'],
  'nav.signOut': ['Sign out', 'साइन आउट'],
  'nav.language': ['Language', 'भाषा'],
  'nav.languageHelp': ['Saved for you in this school.', 'इस स्कूल में आपके लिए सहेजी गई है।'],
  'nav.languageSaved': ['Language saved: English', 'भाषा सहेजी गई: हिंदी (मसौदा अनुवाद)'],
  'nav.careWorkspace': ['Education workspace', 'शिक्षा कार्यक्षेत्र'],
  'nav.patientWorkspace': ['Student workspace', 'छात्र का कार्यक्षेत्र'],
  'nav.saving': ['Saving…', 'सहेजा जा रहा है…'],
  'nav.connected': ['Workspace connected', 'कार्यक्षेत्र जुड़ा है'],
  'nav.offline': ['Offline', 'ऑफ़लाइन'],
  'nav.toggleSidebar': ['Toggle Sidebar', 'साइडबार खोलें या बंद करें'],
  'nav.refresh': ['Refresh workspace', 'कार्यक्षेत्र रीफ़्रेश करें'],
  'nav.pill.synthetic': ['SANDBOX', 'सैंडबॉक्स'],
  'nav.pill.training': ['TRAINING', 'प्रशिक्षण'],
  'nav.pill.staging': ['STAGING', 'स्टेजिंग'],
  'nav.pill.production': ['PRODUCTION', 'प्रोडक्शन'],
  'nav.pill.misconfigured': ['CHECK CONFIG', 'कॉन्फ़िगरेशन जाँचें'],
  'nav.env.synthetic': ['Synthetic development and demonstration environment', 'सिंथेटिक विकास और प्रदर्शन परिवेश'],
  'nav.env.training': ['Training environment with synthetic practice records', 'सिंथेटिक अभ्यास रिकॉर्ड वाला प्रशिक्षण परिवेश'],
  'nav.env.staging': ['Staging environment', 'स्टेजिंग परिवेश'],
  'nav.env.production': ['Production environment', 'प्रोडक्शन परिवेश'],
  'nav.env.misconfigured': ['Environment not configured correctly', 'परिवेश सही ढंग से कॉन्फ़िगर नहीं है'],
  'nav.note.synthetic': ['Use synthetic records only. AI outputs and programme receipts are demonstrations. Live services require approved connections.', 'केवल सिंथेटिक (परीक्षण के लिए बनाए गए) रिकॉर्ड उपयोग करें। एआई के परिणाम और कार्यक्रम की रसीदें केवल प्रदर्शन हैं। लाइव सेवाओं के लिए स्वीकृत कनेक्शन आवश्यक हैं।'],
  'nav.note.training': ['Practice with synthetic records only. Live services are off in training.', 'अभ्यास केवल सिंथेटिक रिकॉर्ड के साथ करें। प्रशिक्षण में लाइव सेवाएँ बंद रहती हैं।'],
  'nav.note.staging': ['Not for real student care. No synthetic fixtures; live services only through checked, granted connections.', 'वास्तविक छात्र देखभाल के लिए नहीं। सिंथेटिक नमूना रिकॉर्ड नहीं; लाइव सेवाएँ केवल जाँचे हुए, स्वीकृत कनेक्शन से।'],
  'nav.note.production': ['This build is not accepted for real student use. Demonstration connectors and synthetic fixtures are refused.', 'यह बिल्ड वास्तविक छात्र उपयोग के लिए स्वीकृत नहीं है। डेमो कनेक्टर और सिंथेटिक नमूना रिकॉर्ड अस्वीकार किए जाते हैं।'],
  'nav.note.misconfigured': ['Fixtures and live services are refused until the operator corrects SAHA_ENVIRONMENT.', 'ऑपरेटर द्वारा SAHA_ENVIRONMENT ठीक किए जाने तक नमूना रिकॉर्ड और लाइव सेवाएँ अस्वीकार की जाती हैं।'],
  'nav.envLoading': ['Loading the environment…', 'परिवेश लोड हो रहा है…'],
  'nav.envAria': ['Environment', 'परिवेश'],
  'nav.offlineStrip': ['You’re offline. This workspace form is not saved on device. Use a previously prepared Field notebook draft for durable offline capture.', 'आप ऑफ़लाइन हैं। यह कार्यक्षेत्र फ़ॉर्म डिवाइस पर सहेजा नहीं जाता। ऑफ़लाइन में टिकाऊ ढंग से दर्ज करने के लिए पहले से तैयार किया गया फ़ील्ड नोटबुक ड्राफ़्ट उपयोग करें।'],
  'nav.paused': ['Organisation paused: {reason}. Unsaved drafts remain on screen.', 'संगठन रोका गया है: {reason}। बिना सहेजे ड्राफ़्ट स्क्रीन पर बने रहते हैं।'],
  'nav.errorTitle': ['Workspace unavailable', 'कार्यक्षेत्र उपलब्ध नहीं है'],
  'nav.tryAgain': ['Try again', 'फिर कोशिश करें'],
  'nav.footerLeft': ['Saha · Connected education workspace', 'सहा · संयुक्त शिक्षा कार्यक्षेत्र'],
  'nav.footerRight': ['Synthetic demonstration · not for student care', 'सिंथेटिक प्रदर्शन · छात्र देखभाल के लिए नहीं'],

  // ---- My work (and the Students list that shares its layout) ----------------------------------------------------------
  'work.eyebrow': ['STUDENTS, COORDINATED', 'समन्वित छात्र'],
  'work.studentsEyebrow': ['STUDENT DIRECTORY', 'छात्र निर्देशिका'],
  'work.title': ['Today\'s work', 'आज का कार्य'],
  'work.titleSupervisor': ['Class worklist', 'कक्षा की कार्य-सूची'],
  'work.studentsTitle': ['Students in your care', 'आपके देखभाल में छात्र'],
  'work.intro': ['A clear view of your classes, students and progress.', 'आपकी कक्षाएँ, छात्र और प्रगति का स्पष्ट दृश्य।'],
  'work.studentsIntro': ['Open a student\'s record to continue education across classes.', 'कक्षाओं में शिक्षा जारी रखने के लिए किसी छात्र का रिकॉर्ड खोलें।'],
  'work.addStudent': ['Add student', 'छात्र जोड़ें'],
  'work.stat.toDo': ['Classes to manage', 'प्रबंधन के लिए कक्षाएँ'],
  'work.stat.toDoSub': ['In your school scope', 'आपके स्कूल क्षेत्र में'],
  'work.stat.inProgress': ['In progress', 'प्रगति में'],
  'work.stat.inProgressSub': ['Saved draft classes', 'सहेजे गए ड्राफ़्ट कक्षाएँ'],
  'work.stat.confirmed': ['Classes confirmed', 'पुष्टि हुई कक्षाएँ'],
  'work.stat.confirmedSub': ['Ready for class review', 'कक्षा समीक्षा के लिए तैयार'],
  'work.stat.attention': ['Needs attention', 'ध्यान चाहिए'],
  'work.stat.attentionSub': ['Check attendance status', 'उपस्थिति स्थिति जाँचें'],
  'work.paged': ['Your school scope holds {total} students. My work is built on the server over the whole scope and loads page by page; records load when opened.', 'आपके स्कूल क्षेत्र में {total} छात्र हैं। “मेरा कार्य” पूरे क्षेत्र पर सर्वर पर बनता है और पृष्ठ-दर-पृष्ठ लोड होता है; रिकॉर्ड खोलने पर लोड होते हैं।'],
  'work.listTitle': ['Your class list', 'आपकी कक्षा सूची'],
  'work.recordsTitle': ['Student records', 'छात्र रिकॉर्ड'],
  'work.assigned': ['Assigned to you', 'आपको सौंपे गए'],
  'work.wholeScope': ['Whole school scope', 'पूरा स्कूल क्षेत्र'],
  'work.currentWorkspace': ['Current workspace', 'वर्तमान कार्यक्षेत्र'],
  'work.searchLabel': ['Search students', 'छात्र खोजें'],
  'work.searchPlaceholder': ['Search name or admission number', 'नाम या प्रवेश संख्या खोजें'],
  'work.filterLabel': ['Filter course', 'पाठ्यक्रम फ़िल्टर'],
  'work.allCourses': ['All courses', 'सभी पाठ्यक्रम'],
  'work.merged': [' · merged record', ' · मर्ज किया गया रिकॉर्ड'],
  'work.status.confirmed': ['Confirmed', 'पुष्टि हुई'],
  'work.status.inProgress': ['In progress', 'प्रगति में'],
  'work.noMatch': ['No matching students', 'कोई मेल खाता छात्र नहीं'],
  'work.noMatchHint': ['Try a different name or course.', 'कोई दूसरा नाम या पाठ्यक्रम आज़माएँ।'],
  'work.noStudents': ['No students in your school scope.', 'आपके स्कूल क्षेत्र में कोई छात्र नहीं।'],
  'work.listFoot': ['Student assignments and role permissions are checked on the server.', 'छात्रों के असाइनमेंट और भूमिका की अनुमतियाँ सर्वर पर जाँची जाती हैं।'],
  'work.pagedFoot': ['Built on the server over your whole school scope. Search the whole scope in Students.', 'आपके पूरे स्कूल क्षेत्र पर सर्वर पर बनी। पूरा क्षेत्र खोजने के लिए “छात्र” में जाएँ।'],
  'work.loadMore': ['Load more', 'और लोड करें'],
  'work.showing': ['Showing {shown} of {total}', '{total} में से {shown} दिखाए जा रहे हैं'],
  'work.railKicker': ['EDUCATION WORKFLOW ASSISTANT', 'शिक्षा कार्यप्रवाह सहायक'],
  'work.railTitle1': ['One class.', 'एक कक्षा।'],
  'work.railTitle2': ['Less repeat work.', 'दोबारा कम काम।'],
  'work.railBody': ['Capture shared facts once. Review where they go. Keep every receipt.', 'साझा तथ्य एक बार दर्ज करें। देखें कि वे कहाँ जाते हैं। हर रसीद सँभालकर रखें।'],
  'work.step1': ['Record the class', 'कक्षा दर्ज करें'],
  'work.step2': ['Review attendance', 'उपस्थिति की समीक्षा करें'],
  'work.step3': ['Track student progress', 'छात्र प्रगति को ट्रैक करें'],
  'work.openNext': ['Open next class', 'अगली कक्षा खोलें'],
  'work.railSmall': ['Guided automation · human approval', 'निर्देशित स्वचालन · मानव स्वीकृति'],
  'work.connOverview': ['Connection overview', 'कनेक्शन का अवलोकन'],
  'work.demoServices': ['demo services available', 'डेमो सेवाएँ उपलब्ध'],
  'work.viewConnections': ['View connections', 'कनेक्शन देखें'],
  'work.followTitle': ['Student progress reports', 'छात्र प्रगति रिपोर्ट'],
  'work.followSub': ['Separate student tasks, grouped by class', 'अलग-अलग छात्र के कार्य, कक्षा के अनुसार समूहित'],
  'work.followEmpty': ['Schedule a follow-up from an active report.', 'किसी सक्रिय रिपोर्ट से फ़ॉलो-अप तय करें।'],
  'work.overdue': [' · Overdue', ' · विलंबित'],
  'work.openRecord': ['Open record →', 'रिकॉर्ड खोलें →'],
  'work.followFoot': ['Open progress reports across your whole school scope.', 'आपके पूरे स्कूल क्षेत्र के रिपोर्ट खोलें।'],
  'work.refTitle': ['Assessment results', 'मूल्यांकन परिणाम'],
  'work.refIntro': ['Named ownership, due dates and a recorded source for each event.', 'हर घटना के लिए नामित ज़िम्मेदार, नियत तिथि और दर्ज स्रोत।'],
  'work.refPagedIntro': ['Named ownership, due dates and a recorded source for each event. Open an assessment to update it.', 'हर घटना के लिए नामित ज़िम्मेदार, नियत तिथि और दर्ज स्रोत। अपडेट करने के लिए मूल्यांकन खोलें।'],
  'work.refEmpty': ['No assessments recorded. Prepare one from a confirmed class.', 'कोई मूल्यांकन दर्ज नहीं। पुष्टि हुई कक्षा से एक तैयार करें।'],
  'work.refRow': ['Owner: {owner} · Due: {due} · Status: {status}', 'ज़िम्मेदार: {owner} · नियत तिथि: {due} · स्थिति: {status}'],
  'work.refOpen': ['Open assessment', 'मूल्यांकन खोलें'],
  'work.refFoot': ['Assessments across your whole school scope.', 'आपके पूरे स्कूल क्षेत्र के मूल्यांकन।'],

  // ---- Student page --------------------------------------------------------------------------------------------------
  'student.backWork': ['Back to my work', 'मेरे कार्य पर वापस'],
  'student.backWorkspace': ['Back to workspace', 'कार्यक्षेत्र पर वापस'],
  'student.record': ['Record', 'रिकॉर्ड'],
  'student.permissions': ['Permissions', 'अनुमतियाँ'],
  'student.newClass': ['New class', 'नई कक्षा'],
  'student.noClassTitle': ['No class recorded yet', 'अभी कोई कक्षा दर्ज नहीं'],
  'student.noClassBody': ['Start a class to capture shared observations and prepare student reports.', 'साझा अवलोकन दर्ज करने और छात्र रिपोर्ट तैयार करने के लिए कक्षा शुरू करें।'],
  'student.startClass': ['Start class', 'कक्षा शुरू करें'],
  'student.previous': ['Previous classes', 'पिछली कक्षाएँ'],
  'student.permTitle': ['Permissions · {name}', 'अनुमतियाँ · {name}'],
  'student.permDesc': ['Record the student\'s choices. Changes apply to future actions.', 'छात्र की पसंद दर्ज करें। बदलाव आगे की कार्रवाइयों पर लागू होते हैं।'],
  'student.aiTitle': ['Optional AI assistance', 'वैकल्पिक एआई सहायता'],
  'student.aiBody': ['Use confirmed class facts with a selected AI tool.', 'चुने हुए एआई उपकरण के साथ पुष्टि हुए कक्षा तथ्यों का उपयोग करें।'],
  'student.shareTitle': ['Student record sharing', 'छात्र रिकॉर्ड साझाकरण'],
  'student.shareBody': ['Sandbox permission only. Does not create an education consent artefact.', 'केवल सैंडबॉक्स अनुमति। यह शिक्षा सहमति अभिलेख नहीं बनाता।'],
  'student.permNote': ['Permission revision {n}. Withdrawal does not delete completed records or recall data already shared. Ordinary class capture remains available.', 'अनुमति संशोधन {n}। अनुमति वापस लेने से पूरे हो चुके रिकॉर्ड नहीं हटते और पहले से साझा किया गया डेटा वापस नहीं बुलाया जाता। सामान्य कक्षा दर्ज करना उपलब्ध रहता है।'],
  'student.aiGranted': ['AI permission recorded', 'एआई अनुमति दर्ज की गई'],
  'student.aiWithdrawn': ['AI permission withdrawn', 'एआई अनुमति वापस ली गई'],
  'student.shareUpdated': ['Sharing preference updated', 'साझाकरण की पसंद अपडेट की गई'],
  'student.emergency': ['Emergency access until {time}. You may read this record and record urgent care. Sharing, consent, identity and assignment changes are not available. This access will be reviewed.', '{time} तक आपातकालीन पहुँच। आप यह रिकॉर्ड पढ़ सकते हैं और तत्काल देखभाल दर्ज कर सकते हैं। साझाकरण, सहमति, पहचान और असाइनमेंट में बदलाव उपलब्ध नहीं हैं। इस पहुँच की समीक्षा की जाएगी।'],
  'student.restricted': ['Processing is restricted under a rights request. Record care as usual; external sharing, programme sending, reminders and optional AI are paused until the restriction is lifted.', 'अधिकार अनुरोध के तहत प्रसंस्करण प्रतिबंधित है। देखभाल हमेशा की तरह दर्ज करें; प्रतिबंध हटने तक बाहरी साझाकरण, कार्यक्रम को भेजना, अनुस्मारक और वैकल्पिक एआई रुके रहेंगे।'],
  'student.consentWithdrawn.one': ['A permission was withdrawn while {n} delivery was awaiting a receipt. Look up each receipt; nothing is resent under the withdrawn permission.', 'एक अनुमति वापस ली गई, जबकि {n} डिलीवरी की रसीद की प्रतीक्षा थी। हर रसीद खोजें; वापस ली गई अनुमति के तहत कुछ भी दोबारा नहीं भेजा जाता।'],
  'student.consentWithdrawn.other': ['A permission was withdrawn while {n} deliveries were awaiting a receipt. Look up each receipt; nothing is resent under the withdrawn permission.', 'एक अनुमति वापस ली गई, जबकि {n} डिलीवरी की रसीद की प्रतीक्षा थी। हर रसीद खोजें; वापस ली गई अनुमति के तहत कुछ भी दोबारा नहीं भेजा जाता।'],
  'student.merged': ['This record was merged into another record on {date}. It is read-only for new care; classes, receipts and history are kept. Open Student & merges for the surviving record and remaining work.', 'यह रिकॉर्ड {date} को किसी दूसरे रिकॉर्ड में मर्ज किया गया। नई देखभाल के लिए यह केवल-पठन है; कक्षाएँ, रसीदें और इतिहास सुरक्षित हैं। शेष रिकॉर्ड और बचे हुए काम के लिए “Student & merges” खोलें।'],
  'student.mergedFrom.one': ['{n} duplicate record was merged into this record. Their history stays on the original record; open Student & merges for remaining work.', '{n} डुप्लिकेट रिकॉर्ड इस रिकॉर्ड में मर्ज किया गया। उसका इतिहास मूल रिकॉर्ड पर ही रहता है; बचे हुए काम के लिए “Student & merges” खोलें।'],
  'student.mergedFrom.other': ['{n} duplicate records were merged into this record. Their history stays on the original record; open Student & merges for remaining work.', '{n} डुप्लिकेट रिकॉर्ड इस रिकॉर्ड में मर्ज किए गए। उनका इतिहास मूल रिकॉर्ड पर ही रहता है; बचे हुए काम के लिए “Student & merges” खोलें।'],
  'student.unsavedTitle': ['Keep your unsaved class?', 'क्या आप बिना सहेजी कक्षा रखना चाहते हैं?'],
  'student.unsavedBody': ['There are changes on this screen that have not been saved. Stay to save them, or discard these edits.', 'इस स्क्रीन पर ऐसे बदलाव हैं जो सहेजे नहीं गए हैं। उन्हें सहेजने के लिए यहीं रुकें, या इन बदलावों को छोड़ दें।'],
  'student.keepEditing': ['Keep editing', 'संपादन जारी रखें'],
  'student.discard': ['Discard edits', 'बदलाव छोड़ें'],

  // ---- Help with a simple translation function
} as const;

export type MessageKey = keyof typeof CATALOGUE;

export function t(locale: Language, key: MessageKey, params?: Params): string {
  const entry = CATALOGUE[key];
  if (!entry) {
    return `Missing translation for ${key}`;
  }
  
  let message = locale === 'hi' ? entry[1] : entry[0];
  if (!message) {
    message = entry[0];
  }
  
  if (params) {
    Object.entries(params).forEach(([param, value]) => {
      message = message.replace(`{${param}}`, String(value));
    });
  }
  
  return message;
}