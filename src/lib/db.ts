export type Category = {
  id: string;
  name: string;
  nameAr: string;
  icon: string;
  color: string;
  bgColor: string;
  subjects: Subject[];
};

export type Subject = {
  id: string;
  name: string;
  nameAr: string;
  categoryId: string;
  minPrice: number;
  tutorCount: number;
  levels: Level[];
};

export type Level = {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  subjectId: string;
  isPopular?: boolean;
  tutorCount: number;
};

export type Tutor = {
  id: string;
  user_id?: string;
  name: string;
  nameAr: string;
  bio: string;
  bioAr: string;
  subjects: string[];
  hourlyRate: number;
  rating: number;
  reviewCount: number;
  experienceYears: number;
  languages: string[];
  avatarUrl: string;
  videoUrl?: string;
  idDocumentUrl?: string;
  id_document_url?: string;
  isOnline: boolean;
  responseTime: string;
  isVerified: boolean;
  category: string;
  levelId: string;
  schedule: ScheduleSlot[];
};

export type ScheduleSlot = {
  id: string;
  dayOfWeek: number;
  dayName: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
};

export type Question = {
  id: string;
  studentName: string;
  studentAvatar: string;
  subject: string;
  question: string;
  answer?: string;
  isAnswered: boolean;
  createdAt: string;
  answeredAt?: string;
};

export const educationCatalog = {
  categories: [
    {
      id: 'school',
      sourceId: 1,
      name: 'School-Level Education',
      nameAr: 'التعليم المدرسي',
      icon: 'school',
      levels: [
        {
          id: 'elementary',
          sourceId: 101,
          name: 'Elementary Stage',
          nameAr: 'الطور الابتدائي',
          grades: ['السنة الأولى', 'السنة الثانية', 'السنة الثالثة', 'السنة الرابعة', 'السنة الخامسة'],
          subjects: [
            {
              name: 'Arabic Language',
              nameAr: 'اللغة العربية',
              weeklyHours: '7:30',
              subTopics: ['قراءة', 'تعبير شفوي', 'تعبير كتابي', 'قواعد', 'إملاء', 'مطالعة'],
            },
            {
              name: 'Mathematics',
              nameAr: 'الرياضيات',
              weeklyHours: '5:00',
              subTopics: ['أعداد وحساب', 'هندسة', 'قياس', 'حل مشكلات'],
            },
            {
              name: 'French Language',
              nameAr: 'اللغة الفرنسية',
              weeklyHours: '3:00',
              subTopics: ['lecture', 'expression', 'grammaire', 'conjugaison'],
              startGrade: 3,
            },
            {
              name: 'English Language',
              nameAr: 'اللغة الإنجليزية',
              weeklyHours: '2:00',
              subTopics: ['reading', 'writing', 'speaking', 'grammar'],
              startGrade: 3,
            },
            {
              name: 'Islamic Education',
              nameAr: 'التربية الإسلامية',
              weeklyHours: '1:30',
              subTopics: ['قرآن كريم', 'سيرة نبوية', 'عقيدة', 'أخلاق'],
            },
            {
              name: 'Scientific & Technological Education',
              nameAr: 'التربية العلمية والتكنولوجية',
              weeklyHours: '1:30',
              subTopics: ['علوم الطبيعة', 'التكنولوجيا البسيطة'],
            },
            { name: 'History', nameAr: 'التاريخ', weeklyHours: '0:30' },
            { name: 'Geography', nameAr: 'الجغرافيا', weeklyHours: '0:30' },
            { name: 'Civic Education', nameAr: 'التربية المدنية', weeklyHours: '0:30' },
            { name: 'Physical Education', nameAr: 'التربية البدنية والرياضية', weeklyHours: '2:00' },
            {
              name: 'Arts Education',
              nameAr: 'التربية الفنية',
              weeklyHours: '1:30',
              subTopics: ['تشكيلية', 'موسيقية'],
            },
            { name: 'Computer Basics', nameAr: 'الإعلام الآلي', weeklyHours: '1:00' },
          ],
        },
        {
          id: 'middle',
          sourceId: 102,
          name: 'Middle School',
          nameAr: 'الطور المتوسط',
          grades: ['السنة الأولى متوسط', 'السنة الثانية متوسط', 'السنة الثالثة متوسط', 'السنة الرابعة متوسط'],
          certificate: 'شهادة التعليم المتوسط (BEM)',
          subjects: [
            { name: 'Arabic Language', nameAr: 'اللغة العربية', category: 'لغات' },
            { name: 'French Language', nameAr: 'اللغة الفرنسية', category: 'لغات' },
            { name: 'English Language', nameAr: 'اللغة الإنجليزية', category: 'لغات' },
            { name: 'Tamazight', nameAr: 'اللغة الأمازيغية', category: 'لغات', optional: true },
            { name: 'Mathematics', nameAr: 'الرياضيات', category: 'علوم' },
            { name: 'Natural & Life Sciences', nameAr: 'العلوم الطبيعية والحياة', category: 'علوم' },
            { name: 'Physics & Technology', nameAr: 'العلوم الفيزيائية والتكنولوجيا', category: 'علوم' },
            { name: 'History & Geography', nameAr: 'التاريخ والجغرافيا', category: 'اجتماعيات' },
            { name: 'Civic Education', nameAr: 'التربية المدنية', category: 'اجتماعيات' },
            { name: 'Islamic Education', nameAr: 'التربية الإسلامية', category: 'اجتماعيات' },
            { name: 'Computer Science', nameAr: 'الإعلام الآلي', category: 'تكنولوجيا' },
            { name: 'Physical Education', nameAr: 'التربية البدنية والرياضية', category: 'أنشطة' },
            { name: 'Arts Education', nameAr: 'التربية الفنية', category: 'أنشطة' },
          ],
        },
        {
          id: 'high',
          sourceId: 103,
          name: 'High School',
          nameAr: 'الطور الثانوي',
          grades: ['السنة الأولى ثانوي', 'السنة الثانية ثانوي', 'السنة الثالثة ثانوي'],
          certificate: 'بكالوريا التعليم الثانوي (BAC)',
          tracks: [
            {
              name: 'Experimental Sciences',
              nameAr: 'علوم تجريبية',
              subjects: ['رياضيات', 'علوم طبيعية', 'فيزياء', 'كيمياء', 'عربية', 'فرنسية', 'إنجليزية', 'فلسفة', 'تاريخ وجغرافيا', 'إسلامية'],
            },
            {
              name: 'Mathematics Track',
              nameAr: 'رياضيات',
              subjects: ['رياضيات', 'فيزياء', 'علوم طبيعية', 'عربية', 'فرنسية', 'إنجليزية', 'فلسفة', 'تاريخ وجغرافيا', 'إسلامية'],
            },
            {
              name: 'Technical Mathematics',
              nameAr: 'تقني رياضي',
              subjects: ['رياضيات', 'فيزياء', 'هندسة كهربائية/مدنية/ميكانيكية', 'عربية', 'فرنسية', 'إنجليزية', 'فلسفة'],
            },
            {
              name: 'Management & Economics',
              nameAr: 'تسيير واقتصاد',
              subjects: ['رياضيات', 'تسيير محاسبي', 'اقتصاد ومناجمنت', 'قانون', 'عربية', 'فرنسية', 'إنجليزية', 'فلسفة', 'تاريخ وجغرافيا'],
            },
            {
              name: 'Literature & Philosophy',
              nameAr: 'آداب وفلسفة',
              subjects: ['فلسفة', 'عربية', 'فرنسية', 'إنجليزية', 'تاريخ وجغرافيا', 'إسلامية'],
            },
            {
              name: 'Foreign Languages',
              nameAr: 'لغات أجنبية',
              subjects: ['إنجليزية', 'فرنسية', 'إسبانية/ألمانية/إيطالية', 'عربية', 'فلسفة', 'تاريخ وجغرافيا'],
            },
          ],
        },
      ],
    },
    {
      id: 'university',
      sourceId: 2,
      name: 'University Education',
      nameAr: 'التعليم الجامعي',
      icon: 'university',
      system: 'ل.م.د (ليسانس - ماستر - دكتوراه)',
      degrees: [
        { name: 'Bachelor', nameAr: 'ليسانس', duration: '3 سنوات', semesters: 6 },
        { name: 'Master', nameAr: 'ماستر', duration: '2 سنتان', semesters: 4 },
        { name: 'Doctorate', nameAr: 'دكتوراه', duration: '3+ سنوات' },
      ],
      fields: [
        {
          id: 'humanities',
          sourceId: 201,
          name: 'Humanities & Social Sciences',
          nameAr: 'العلوم الإنسانية والاجتماعية',
          specializations: [
            { name: 'Psychology', nameAr: 'علم النفس', branches: ['عيادي', 'مدرسي', 'تنظيم وعمل', 'اجتماعي', 'معرفي'] },
            { name: 'Educational Sciences', nameAr: 'علوم التربية', branches: ['أنظمة تعليمية', 'قياس وتقويم', 'تربية خاصة'] },
            { name: 'Sociology', nameAr: 'علم الاجتماع', branches: ['تربوي', 'حضري', 'ثقافي', 'عائلي', 'تنظيم وعمل'] },
            { name: 'Philosophy', nameAr: 'الفلسفة', branches: ['عربية إسلامية', 'غربية حديثة', 'فلسفة عامة'] },
            { name: 'History', nameAr: 'التاريخ', branches: ['قديم', 'وسيط', 'حديث ومعاصر'] },
            { name: 'Speech Therapy', nameAr: 'الأرطوفونيا' },
            { name: 'Library Science', nameAr: 'علم المكتبات' },
            { name: 'Anthropology', nameAr: 'الأنثروبولوجيا' },
          ],
        },
        {
          id: 'languages-literature',
          sourceId: 202,
          name: 'Languages & Literature',
          nameAr: 'اللغات والآداب',
          specializations: [
            { name: 'Arabic Language & Literature', nameAr: 'اللغة العربية وآدابها', branches: ['أدب قديم', 'أدب حديث', 'نقد أدبي', 'لسانيات'] },
            { name: 'Translation', nameAr: 'الترجمة', branches: ['عربي-فرنسي', 'عربي-إنجليزي', 'عربي-تركي'] },
            { name: 'French Language', nameAr: 'اللغة الفرنسية' },
            { name: 'English Language', nameAr: 'اللغة الإنجليزية' },
            { name: 'Turkish Language & Culture', nameAr: 'اللغة والثقافة التركية' },
            { name: 'Russian Language & Culture', nameAr: 'اللغة والثقافة الروسية' },
          ],
        },
        {
          id: 'science-tech',
          sourceId: 203,
          name: 'Science & Technology',
          nameAr: 'العلوم والتكنولوجيا',
          specializations: [
            'رياضيات',
            'فيزياء',
            'كيمياء',
            'بيولوجيا',
            'إعلام آلي',
            'هندسة مدنية',
            'هندسة كهربائية',
            'هندسة ميكانيكية',
            'إلكترونيك',
          ],
        },
        {
          id: 'medical-sciences',
          sourceId: 204,
          name: 'Medical Sciences',
          nameAr: 'العلوم الطبية',
          specializations: ['طب عام', 'صيدلة', 'طب أسنان', 'علوم تمريضية'],
        },
        {
          id: 'economics-management',
          sourceId: 205,
          name: 'Economics & Management',
          nameAr: 'العلوم الاقتصادية والتسيير',
          specializations: ['محاسبة ومالية', 'تسويق', 'إدارة أعمال', 'اقتصاد'],
        },
        {
          id: 'law-politics',
          sourceId: 206,
          name: 'Law & Political Sciences',
          nameAr: 'الحقوق والعلوم السياسية',
          specializations: ['قانون عام', 'قانون خاص', 'قانون دولي', 'علوم سياسية'],
        },
        {
          id: 'media-communication',
          sourceId: 207,
          name: 'Media & Communication',
          nameAr: 'علوم الإعلام والاتصال',
          specializations: ['صحافة', 'اتصال تنظيمي', 'سمعي بصري'],
        },
      ],
    },
    {
      id: 'digital',
      sourceId: 3,
      name: 'Digital & Creative Skills',
      nameAr: 'المهارات الرقمية والإبداعية',
      icon: 'digital',
      modules: [
        { name: 'Digital Foundations', nameAr: 'أساسيات رقمية', courses: ['محو الأمية الرقمية', 'أدوات المكتب', 'التخزين السحابي', 'البحث الرقمي'] },
        { name: 'Programming & Development', nameAr: 'البرمجة والتطوير', courses: ['Scratch للأطفال', 'Python', 'تطوير الويب (HTML/CSS/JS)', 'تطوير تطبيقات الموبايل', 'قواعد البيانات'] },
        { name: 'Artificial Intelligence', nameAr: 'الذكاء الاصطناعي', courses: ['مقدمة في AI', 'تعلم الآلة', 'التعلم العميق', 'تحليل البيانات', 'الروبوتات'] },
        { name: 'Digital Creativity', nameAr: 'الإبداع الرقمي', courses: ['تصميم غرافيكي', 'UI/UX', 'إنتاج فيديو', 'رسوم متحركة', 'بودكاست', 'تصوير فوتوغرافي'] },
        { name: 'Cybersecurity', nameAr: 'الأمن السيبراني', courses: ['حماية البيانات', 'كلمات المرور', 'الاحتيال الرقمي', 'الأخلاقيات الرقمية'] },
      ],
    },
    {
      id: 'technology',
      sourceId: 4,
      name: 'Technology & Finance',
      nameAr: 'التكنولوجيا والمالية',
      icon: 'technology',
      modules: [
        { name: 'Finance Fundamentals', nameAr: 'أساسيات المالية', courses: ['مبادئ الاقتصاد', 'المحاسبة الأساسية', 'التمويل الشخصي', 'الأسواق المالية'] },
        { name: 'FinTech', nameAr: 'التكنولوجيا المالية (FinTech)', courses: ['مقدمة في FinTech', 'البلوك تشين', 'العملات الرقمية', 'الدفع الإلكتروني', 'البنوك الرقمية', 'التداول الإلكتروني'] },
      ],
    },
    {
      id: 'languages',
      sourceId: 5,
      name: 'Languages & Communication',
      nameAr: 'اللغات والتواصل',
      icon: 'languages',
      languages: [
        { name: 'Arabic', nameAr: 'العربية', levels: ['مبتدئ', 'متوسط', 'متقدم', 'احترافي'], skills: ['نحو', 'صرف', 'بلاغة', 'إملاء', 'تعبير كتابي', 'تعبير شفوي'] },
        { name: 'French', nameAr: 'الفرنسية', levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], skills: ['grammaire', 'conjugaison', 'expression', 'compréhension'] },
        { name: 'English', nameAr: 'الإنجليزية', levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], skills: ['grammar', 'writing', 'speaking', 'listening', 'reading'] },
        { name: 'Tamazight', nameAr: 'الأمازيغية' },
        { name: 'Spanish', nameAr: 'الإسبانية' },
        { name: 'German', nameAr: 'الألمانية' },
        { name: 'Turkish', nameAr: 'التركية' },
        { name: 'Chinese', nameAr: 'الصينية' },
        { name: 'Russian', nameAr: 'الروسية' },
      ],
      communicationSkills: ['فن الخطابة والإلقاء', 'التحرير الإداري', 'الترجمة', 'التواصل الرقمي', 'لغة الجسد'],
    },
    {
      id: 'personal',
      sourceId: 6,
      name: 'Personal Development & Life Skills',
      nameAr: 'التطوير الشخصي ومهارات الحياة',
      icon: 'personal',
      modules: [
        { name: 'Thinking Skills', nameAr: 'مهارات التفكير', courses: ['التفكير النقدي', 'التفكير الإبداعي', 'حل المشكلات', 'التفكير الاستراتيجي'] },
        { name: 'Self Management', nameAr: 'إدارة الذات', courses: ['إدارة الوقت', 'تحديد الأهداف', 'إدارة الضغوط', 'بناء العادات', 'التعلم الذاتي'] },
        { name: 'Social Skills', nameAr: 'مهارات اجتماعية', courses: ['الذكاء العاطفي', 'القيادة', 'العمل الجماعي', 'التفاوض', 'بناء العلاقات'] },
        { name: 'Career Planning', nameAr: 'التخطيط المهني', courses: ['اكتشاف الذات', 'كتابة السيرة الذاتية', 'المقابلات', 'ريادة الأعمال', 'الثقافة المالية'] },
        { name: 'Health & Safety', nameAr: 'الصحة والسلامة', courses: ['التغذية', 'الصحة النفسية', 'الإسعافات الأولية', 'السلامة المرورية'] },
      ],
    },
  ],
} as const;

const CATEGORY_THEME: Record<string, { color: string; bgColor: string }> = {
  school: { color: '#3B82F6', bgColor: '#EFF6FF' },
  university: { color: '#3B82F6', bgColor: '#EFF6FF' },
  digital: { color: '#8B5CF6', bgColor: '#F5F3FF' },
  technology: { color: '#10B981', bgColor: '#ECFDF5' },
  languages: { color: '#3B82F6', bgColor: '#EFF6FF' },
  personal: { color: '#F59E0B', bgColor: '#FFFBEB' },
};

export const categories: Category[] = educationCatalog.categories.map((category) => ({
  id: category.id,
  name: category.name,
  nameAr: category.nameAr,
  icon: category.icon,
  color: CATEGORY_THEME[category.id].color,
  bgColor: CATEGORY_THEME[category.id].bgColor,
  subjects: [],
}));

export const subjects: Subject[] = [
  { id: 'elementary', name: 'Elementary Stage', nameAr: 'الطور الابتدائي', categoryId: 'school', minPrice: 12, tutorCount: 18, levels: [] },
  { id: 'middle', name: 'Middle School', nameAr: 'الطور المتوسط', categoryId: 'school', minPrice: 15, tutorCount: 16, levels: [] },
  { id: 'high', name: 'High School', nameAr: 'الطور الثانوي', categoryId: 'school', minPrice: 24, tutorCount: 14, levels: [] },

  { id: 'humanities', name: 'Humanities & Social Sciences', nameAr: 'العلوم الإنسانية والاجتماعية', categoryId: 'university', minPrice: 28, tutorCount: 18, levels: [] },
  { id: 'languages-literature', name: 'Languages & Literature', nameAr: 'اللغات والآداب', categoryId: 'university', minPrice: 26, tutorCount: 16, levels: [] },
  { id: 'science-tech', name: 'Science & Technology', nameAr: 'العلوم والتكنولوجيا', categoryId: 'university', minPrice: 35, tutorCount: 20, levels: [] },
  { id: 'medical-sciences', name: 'Medical Sciences', nameAr: 'العلوم الطبية', categoryId: 'university', minPrice: 45, tutorCount: 10, levels: [] },
  { id: 'economics-management', name: 'Economics & Management', nameAr: 'العلوم الاقتصادية والتسيير', categoryId: 'university', minPrice: 30, tutorCount: 14, levels: [] },
  { id: 'law-politics', name: 'Law & Political Sciences', nameAr: 'الحقوق والعلوم السياسية', categoryId: 'university', minPrice: 32, tutorCount: 12, levels: [] },
  { id: 'media-communication', name: 'Media & Communication', nameAr: 'علوم الإعلام والاتصال', categoryId: 'university', minPrice: 29, tutorCount: 12, levels: [] },

  { id: 'digital-foundations', name: 'Digital Foundations', nameAr: 'أساسيات رقمية', categoryId: 'digital', minPrice: 18, tutorCount: 15, levels: [] },
  { id: 'programming-development', name: 'Programming & Development', nameAr: 'البرمجة والتطوير', categoryId: 'digital', minPrice: 28, tutorCount: 22, levels: [] },
  { id: 'artificial-intelligence', name: 'Artificial Intelligence', nameAr: 'الذكاء الاصطناعي', categoryId: 'digital', minPrice: 35, tutorCount: 16, levels: [] },
  { id: 'digital-creativity', name: 'Digital Creativity', nameAr: 'الإبداع الرقمي', categoryId: 'digital', minPrice: 25, tutorCount: 18, levels: [] },
  { id: 'cybersecurity', name: 'Cybersecurity', nameAr: 'الأمن السيبراني', categoryId: 'digital', minPrice: 32, tutorCount: 14, levels: [] },

  { id: 'finance-fundamentals', name: 'Finance Fundamentals', nameAr: 'أساسيات المالية', categoryId: 'technology', minPrice: 24, tutorCount: 12, levels: [] },
  { id: 'fintech', name: 'FinTech', nameAr: 'التكنولوجيا المالية (FinTech)', categoryId: 'technology', minPrice: 34, tutorCount: 14, levels: [] },

  { id: 'arabic', name: 'Arabic', nameAr: 'العربية', categoryId: 'languages', minPrice: 18, tutorCount: 16, levels: [] },
  { id: 'french', name: 'French', nameAr: 'الفرنسية', categoryId: 'languages', minPrice: 20, tutorCount: 14, levels: [] },
  { id: 'english', name: 'English', nameAr: 'الإنجليزية', categoryId: 'languages', minPrice: 20, tutorCount: 18, levels: [] },
  { id: 'tamazight', name: 'Tamazight', nameAr: 'الأمازيغية', categoryId: 'languages', minPrice: 18, tutorCount: 8, levels: [] },
  { id: 'spanish', name: 'Spanish', nameAr: 'الإسبانية', categoryId: 'languages', minPrice: 19, tutorCount: 8, levels: [] },
  { id: 'german', name: 'German', nameAr: 'الألمانية', categoryId: 'languages', minPrice: 21, tutorCount: 8, levels: [] },
  { id: 'turkish', name: 'Turkish', nameAr: 'التركية', categoryId: 'languages', minPrice: 19, tutorCount: 8, levels: [] },
  { id: 'chinese', name: 'Chinese', nameAr: 'الصينية', categoryId: 'languages', minPrice: 22, tutorCount: 8, levels: [] },
  { id: 'russian', name: 'Russian', nameAr: 'الروسية', categoryId: 'languages', minPrice: 20, tutorCount: 8, levels: [] },
  { id: 'communication-skills', name: 'Communication Skills', nameAr: 'مهارات التواصل', categoryId: 'languages', minPrice: 18, tutorCount: 12, levels: [] },

  { id: 'thinking-skills', name: 'Thinking Skills', nameAr: 'مهارات التفكير', categoryId: 'personal', minPrice: 18, tutorCount: 14, levels: [] },
  { id: 'self-management', name: 'Self Management', nameAr: 'إدارة الذات', categoryId: 'personal', minPrice: 18, tutorCount: 16, levels: [] },
  { id: 'social-skills', name: 'Social Skills', nameAr: 'مهارات اجتماعية', categoryId: 'personal', minPrice: 18, tutorCount: 14, levels: [] },
  { id: 'career-planning', name: 'Career Planning', nameAr: 'التخطيط المهني', categoryId: 'personal', minPrice: 20, tutorCount: 12, levels: [] },
  { id: 'health-safety', name: 'Health & Safety', nameAr: 'الصحة والسلامة', categoryId: 'personal', minPrice: 16, tutorCount: 10, levels: [] },
];

export const levels: Level[] = [
  { id: 'elementary-grade-1', name: 'Grade 1', nameAr: 'السنة الأولى', price: 12, subjectId: 'elementary', isPopular: true, tutorCount: 12 },
  { id: 'elementary-grade-2', name: 'Grade 2', nameAr: 'السنة الثانية', price: 12, subjectId: 'elementary', tutorCount: 12 },
  { id: 'elementary-grade-3', name: 'Grade 3', nameAr: 'السنة الثالثة', price: 13, subjectId: 'elementary', tutorCount: 11 },
  { id: 'elementary-grade-4', name: 'Grade 4', nameAr: 'السنة الرابعة', price: 14, subjectId: 'elementary', tutorCount: 10 },
  { id: 'elementary-grade-5', name: 'Grade 5', nameAr: 'السنة الخامسة', price: 15, subjectId: 'elementary', tutorCount: 10 },

  { id: 'middle-grade-1', name: '1st Year Middle School', nameAr: 'السنة الأولى متوسط', price: 15, subjectId: 'middle', isPopular: true, tutorCount: 12 },
  { id: 'middle-grade-2', name: '2nd Year Middle School', nameAr: 'السنة الثانية متوسط', price: 16, subjectId: 'middle', tutorCount: 11 },
  { id: 'middle-grade-3', name: '3rd Year Middle School', nameAr: 'السنة الثالثة متوسط', price: 17, subjectId: 'middle', tutorCount: 10 },
  { id: 'middle-grade-4', name: '4th Year Middle School (BEM)', nameAr: 'السنة الرابعة متوسط', price: 18, subjectId: 'middle', tutorCount: 10 },

  { id: 'high-experimental', name: 'Experimental Sciences', nameAr: 'علوم تجريبية', price: 24, subjectId: 'high', isPopular: true, tutorCount: 12 },
  { id: 'high-math', name: 'Mathematics Track', nameAr: 'رياضيات', price: 25, subjectId: 'high', tutorCount: 10 },
  { id: 'high-technical', name: 'Technical Mathematics', nameAr: 'تقني رياضي', price: 26, subjectId: 'high', tutorCount: 9 },
  { id: 'high-management', name: 'Management & Economics', nameAr: 'تسيير واقتصاد', price: 23, subjectId: 'high', tutorCount: 9 },
  { id: 'high-literature', name: 'Literature & Philosophy', nameAr: 'آداب وفلسفة', price: 22, subjectId: 'high', tutorCount: 8 },
  { id: 'high-languages', name: 'Foreign Languages', nameAr: 'لغات أجنبية', price: 23, subjectId: 'high', tutorCount: 8 },

  { id: 'hum-psych-clinical', name: 'Psychology - Clinical', nameAr: 'علم النفس - عيادي', price: 28, subjectId: 'humanities', isPopular: true, tutorCount: 10 },
  { id: 'hum-psych-school', name: 'Psychology - School', nameAr: 'علم النفس - مدرسي', price: 28, subjectId: 'humanities', tutorCount: 8 },
  { id: 'hum-psych-work', name: 'Psychology - Organization & Work', nameAr: 'علم النفس - تنظيم وعمل', price: 29, subjectId: 'humanities', tutorCount: 8 },
  { id: 'hum-edu-systems', name: 'Educational Sciences - Educational Systems', nameAr: 'علوم التربية - أنظمة تعليمية', price: 27, subjectId: 'humanities', tutorCount: 8 },
  { id: 'hum-edu-measurement', name: 'Educational Sciences - Assessment', nameAr: 'علوم التربية - قياس وتقويم', price: 27, subjectId: 'humanities', tutorCount: 7 },
  { id: 'hum-sociology', name: 'Sociology', nameAr: 'علم الاجتماع', price: 26, subjectId: 'humanities', tutorCount: 7 },
  { id: 'hum-philosophy', name: 'Philosophy', nameAr: 'الفلسفة', price: 26, subjectId: 'humanities', tutorCount: 7 },
  { id: 'hum-history', name: 'History', nameAr: 'التاريخ', price: 25, subjectId: 'humanities', tutorCount: 7 },
  { id: 'hum-orthophony', name: 'Speech Therapy', nameAr: 'الأرطوفونيا', price: 32, subjectId: 'humanities', tutorCount: 6 },
  { id: 'hum-library', name: 'Library Science', nameAr: 'علم المكتبات', price: 24, subjectId: 'humanities', tutorCount: 6 },
  { id: 'hum-anthropology', name: 'Anthropology', nameAr: 'الأنثروبولوجيا', price: 25, subjectId: 'humanities', tutorCount: 6 },

  { id: 'langlit-arabic-lit', name: 'Arabic Literature', nameAr: 'اللغة العربية وآدابها', price: 26, subjectId: 'languages-literature', isPopular: true, tutorCount: 10 },
  { id: 'langlit-translation', name: 'Translation', nameAr: 'الترجمة', price: 28, subjectId: 'languages-literature', tutorCount: 9 },
  { id: 'langlit-french', name: 'French Language', nameAr: 'اللغة الفرنسية', price: 24, subjectId: 'languages-literature', tutorCount: 8 },
  { id: 'langlit-english', name: 'English Language', nameAr: 'اللغة الإنجليزية', price: 24, subjectId: 'languages-literature', tutorCount: 8 },
  { id: 'langlit-turkish', name: 'Turkish Language & Culture', nameAr: 'اللغة والثقافة التركية', price: 24, subjectId: 'languages-literature', tutorCount: 7 },
  { id: 'langlit-russian', name: 'Russian Language & Culture', nameAr: 'اللغة والثقافة الروسية', price: 24, subjectId: 'languages-literature', tutorCount: 7 },

  { id: 'science-math', name: 'Mathematics', nameAr: 'رياضيات', price: 35, subjectId: 'science-tech', isPopular: true, tutorCount: 12 },
  { id: 'science-physics', name: 'Physics', nameAr: 'فيزياء', price: 35, subjectId: 'science-tech', tutorCount: 10 },
  { id: 'science-chemistry', name: 'Chemistry', nameAr: 'كيمياء', price: 34, subjectId: 'science-tech', tutorCount: 10 },
  { id: 'science-biology', name: 'Biology', nameAr: 'بيولوجيا', price: 34, subjectId: 'science-tech', tutorCount: 10 },
  { id: 'science-computing', name: 'Computer Science', nameAr: 'إعلام آلي', price: 38, subjectId: 'science-tech', tutorCount: 11 },
  { id: 'science-civil', name: 'Civil Engineering', nameAr: 'هندسة مدنية', price: 40, subjectId: 'science-tech', tutorCount: 8 },
  { id: 'science-electrical', name: 'Electrical Engineering', nameAr: 'هندسة كهربائية', price: 40, subjectId: 'science-tech', tutorCount: 8 },
  { id: 'science-mechanical', name: 'Mechanical Engineering', nameAr: 'هندسة ميكانيكية', price: 40, subjectId: 'science-tech', tutorCount: 8 },
  { id: 'science-electronics', name: 'Electronics', nameAr: 'إلكترونيك', price: 38, subjectId: 'science-tech', tutorCount: 8 },

  { id: 'med-general', name: 'General Medicine', nameAr: 'طب عام', price: 45, subjectId: 'medical-sciences', isPopular: true, tutorCount: 8 },
  { id: 'med-pharmacy', name: 'Pharmacy', nameAr: 'صيدلة', price: 42, subjectId: 'medical-sciences', tutorCount: 8 },
  { id: 'med-dentistry', name: 'Dentistry', nameAr: 'طب أسنان', price: 44, subjectId: 'medical-sciences', tutorCount: 7 },
  { id: 'med-nursing', name: 'Nursing Sciences', nameAr: 'علوم تمريضية', price: 36, subjectId: 'medical-sciences', tutorCount: 7 },

  { id: 'eco-accounting', name: 'Accounting & Finance', nameAr: 'محاسبة ومالية', price: 30, subjectId: 'economics-management', isPopular: true, tutorCount: 9 },
  { id: 'eco-marketing', name: 'Marketing', nameAr: 'تسويق', price: 29, subjectId: 'economics-management', tutorCount: 9 },
  { id: 'eco-business', name: 'Business Administration', nameAr: 'إدارة أعمال', price: 31, subjectId: 'economics-management', tutorCount: 8 },
  { id: 'eco-economics', name: 'Economics', nameAr: 'اقتصاد', price: 30, subjectId: 'economics-management', tutorCount: 8 },

  { id: 'law-public', name: 'Public Law', nameAr: 'قانون عام', price: 32, subjectId: 'law-politics', isPopular: true, tutorCount: 8 },
  { id: 'law-private', name: 'Private Law', nameAr: 'قانون خاص', price: 32, subjectId: 'law-politics', tutorCount: 8 },
  { id: 'law-international', name: 'International Law', nameAr: 'قانون دولي', price: 34, subjectId: 'law-politics', tutorCount: 7 },
  { id: 'law-political', name: 'Political Sciences', nameAr: 'علوم سياسية', price: 30, subjectId: 'law-politics', tutorCount: 7 },

  { id: 'media-journalism', name: 'Journalism', nameAr: 'صحافة', price: 29, subjectId: 'media-communication', isPopular: true, tutorCount: 8 },
  { id: 'media-organizational', name: 'Organizational Communication', nameAr: 'اتصال تنظيمي', price: 28, subjectId: 'media-communication', tutorCount: 7 },
  { id: 'media-audiovisual', name: 'Audiovisual Media', nameAr: 'سمعي بصري', price: 30, subjectId: 'media-communication', tutorCount: 7 },

  { id: 'digital-literacy', name: 'Digital Literacy', nameAr: 'محو الأمية الرقمية', price: 18, subjectId: 'digital-foundations', isPopular: true, tutorCount: 10 },
  { id: 'office-tools', name: 'Office Tools', nameAr: 'أدوات المكتب', price: 18, subjectId: 'digital-foundations', tutorCount: 10 },
  { id: 'cloud-storage', name: 'Cloud Storage', nameAr: 'التخزين السحابي', price: 19, subjectId: 'digital-foundations', tutorCount: 9 },
  { id: 'digital-search', name: 'Digital Research', nameAr: 'البحث الرقمي', price: 18, subjectId: 'digital-foundations', tutorCount: 9 },

  { id: 'scratch-kids', name: 'Scratch for Kids', nameAr: 'Scratch للأطفال', price: 22, subjectId: 'programming-development', tutorCount: 10 },
  { id: 'prog-python', name: 'Python', nameAr: 'Python', price: 28, subjectId: 'programming-development', isPopular: true, tutorCount: 14 },
  { id: 'prog-web', name: 'Web Development (HTML/CSS/JS)', nameAr: 'تطوير الويب (HTML/CSS/JS)', price: 30, subjectId: 'programming-development', tutorCount: 14 },
  { id: 'prog-mobile', name: 'Mobile App Development', nameAr: 'تطوير تطبيقات الموبايل', price: 32, subjectId: 'programming-development', tutorCount: 12 },
  { id: 'prog-database', name: 'Databases', nameAr: 'قواعد البيانات', price: 30, subjectId: 'programming-development', tutorCount: 12 },

  { id: 'ai-intro', name: 'Introduction to AI', nameAr: 'مقدمة في AI', price: 35, subjectId: 'artificial-intelligence', isPopular: true, tutorCount: 10 },
  { id: 'ai-ml', name: 'Machine Learning', nameAr: 'تعلم الآلة', price: 38, subjectId: 'artificial-intelligence', tutorCount: 10 },
  { id: 'ai-deep', name: 'Deep Learning', nameAr: 'التعلم العميق', price: 40, subjectId: 'artificial-intelligence', tutorCount: 8 },
  { id: 'ai-data', name: 'Data Analysis', nameAr: 'تحليل البيانات', price: 34, subjectId: 'artificial-intelligence', tutorCount: 9 },
  { id: 'ai-robotics', name: 'Robotics', nameAr: 'الروبوتات', price: 38, subjectId: 'artificial-intelligence', tutorCount: 8 },

  { id: 'creative-graphic', name: 'Graphic Design', nameAr: 'تصميم غرافيكي', price: 25, subjectId: 'digital-creativity', isPopular: true, tutorCount: 11 },
  { id: 'creative-uiux', name: 'UI/UX', nameAr: 'UI/UX', price: 28, subjectId: 'digital-creativity', tutorCount: 10 },
  { id: 'creative-video', name: 'Video Production', nameAr: 'إنتاج فيديو', price: 30, subjectId: 'digital-creativity', tutorCount: 9 },
  { id: 'creative-animation', name: 'Animation', nameAr: 'رسوم متحركة', price: 29, subjectId: 'digital-creativity', tutorCount: 8 },
  { id: 'creative-podcast', name: 'Podcasting', nameAr: 'بودكاست', price: 24, subjectId: 'digital-creativity', tutorCount: 8 },
  { id: 'creative-photo', name: 'Photography', nameAr: 'تصوير فوتوغرافي', price: 26, subjectId: 'digital-creativity', tutorCount: 8 },

  { id: 'cyber-data', name: 'Data Protection', nameAr: 'حماية البيانات', price: 32, subjectId: 'cybersecurity', isPopular: true, tutorCount: 9 },
  { id: 'cyber-passwords', name: 'Password Security', nameAr: 'كلمات المرور', price: 28, subjectId: 'cybersecurity', tutorCount: 9 },
  { id: 'cyber-fraud', name: 'Digital Fraud Awareness', nameAr: 'الاحتيال الرقمي', price: 29, subjectId: 'cybersecurity', tutorCount: 8 },
  { id: 'cyber-ethics', name: 'Digital Ethics', nameAr: 'الأخلاقيات الرقمية', price: 27, subjectId: 'cybersecurity', tutorCount: 8 },

  { id: 'fin-economics', name: 'Principles of Economics', nameAr: 'مبادئ الاقتصاد', price: 24, subjectId: 'finance-fundamentals', isPopular: true, tutorCount: 8 },
  { id: 'fin-accounting', name: 'Basic Accounting', nameAr: 'المحاسبة الأساسية', price: 24, subjectId: 'finance-fundamentals', tutorCount: 8 },
  { id: 'fin-personal', name: 'Personal Finance', nameAr: 'التمويل الشخصي', price: 23, subjectId: 'finance-fundamentals', tutorCount: 8 },
  { id: 'fin-markets', name: 'Financial Markets', nameAr: 'الأسواق المالية', price: 26, subjectId: 'finance-fundamentals', tutorCount: 7 },

  { id: 'fintech-intro', name: 'Introduction to FinTech', nameAr: 'مقدمة في FinTech', price: 34, subjectId: 'fintech', isPopular: true, tutorCount: 8 },
  { id: 'fintech-blockchain', name: 'Blockchain', nameAr: 'البلوك تشين', price: 36, subjectId: 'fintech', tutorCount: 8 },
  { id: 'fintech-crypto', name: 'Digital Currencies', nameAr: 'العملات الرقمية', price: 36, subjectId: 'fintech', tutorCount: 8 },
  { id: 'fintech-payment', name: 'Electronic Payments', nameAr: 'الدفع الإلكتروني', price: 33, subjectId: 'fintech', tutorCount: 7 },
  { id: 'fintech-banks', name: 'Digital Banking', nameAr: 'البنوك الرقمية', price: 35, subjectId: 'fintech', tutorCount: 7 },
  { id: 'fintech-trading', name: 'Online Trading', nameAr: 'التداول الإلكتروني', price: 35, subjectId: 'fintech', tutorCount: 7 },

  { id: 'arabic-beginner', name: 'Beginner', nameAr: 'مبتدئ', price: 18, subjectId: 'arabic', tutorCount: 10 },
  { id: 'arabic-intermediate', name: 'Intermediate', nameAr: 'متوسط', price: 20, subjectId: 'arabic', isPopular: true, tutorCount: 10 },
  { id: 'arabic-advanced', name: 'Advanced', nameAr: 'متقدم', price: 22, subjectId: 'arabic', tutorCount: 9 },
  { id: 'arabic-pro', name: 'Professional', nameAr: 'احترافي', price: 24, subjectId: 'arabic', tutorCount: 8 },

  { id: 'french-a1', name: 'A1', nameAr: 'A1', price: 20, subjectId: 'french', tutorCount: 9 },
  { id: 'french-a2', name: 'A2', nameAr: 'A2', price: 20, subjectId: 'french', tutorCount: 9 },
  { id: 'french-b1', name: 'B1', nameAr: 'B1', price: 22, subjectId: 'french', isPopular: true, tutorCount: 9 },
  { id: 'french-b2', name: 'B2', nameAr: 'B2', price: 23, subjectId: 'french', tutorCount: 8 },
  { id: 'french-c1', name: 'C1', nameAr: 'C1', price: 24, subjectId: 'french', tutorCount: 7 },
  { id: 'french-c2', name: 'C2', nameAr: 'C2', price: 25, subjectId: 'french', tutorCount: 6 },

  { id: 'english-a1', name: 'A1', nameAr: 'A1', price: 20, subjectId: 'english', tutorCount: 10 },
  { id: 'english-a2', name: 'A2', nameAr: 'A2', price: 20, subjectId: 'english', tutorCount: 10 },
  { id: 'english-b1', name: 'B1', nameAr: 'B1', price: 22, subjectId: 'english', isPopular: true, tutorCount: 10 },
  { id: 'english-b2', name: 'B2', nameAr: 'B2', price: 23, subjectId: 'english', tutorCount: 9 },
  { id: 'english-c1', name: 'C1', nameAr: 'C1', price: 24, subjectId: 'english', tutorCount: 8 },
  { id: 'english-c2', name: 'C2', nameAr: 'C2', price: 25, subjectId: 'english', tutorCount: 7 },

  { id: 'tamazight-beginner', name: 'Beginner', nameAr: 'مبتدئ', price: 18, subjectId: 'tamazight', tutorCount: 6 },
  { id: 'tamazight-intermediate', name: 'Intermediate', nameAr: 'متوسط', price: 19, subjectId: 'tamazight', isPopular: true, tutorCount: 6 },
  { id: 'tamazight-advanced', name: 'Advanced', nameAr: 'متقدم', price: 20, subjectId: 'tamazight', tutorCount: 5 },
  { id: 'tamazight-expert', name: 'Expert', nameAr: 'خبير', price: 22, subjectId: 'tamazight', tutorCount: 4 },

  { id: 'spanish-beginner', name: 'Beginner', nameAr: 'مبتدئ', price: 19, subjectId: 'spanish', tutorCount: 6 },
  { id: 'spanish-intermediate', name: 'Intermediate', nameAr: 'متوسط', price: 20, subjectId: 'spanish', isPopular: true, tutorCount: 6 },
  { id: 'spanish-advanced', name: 'Advanced', nameAr: 'متقدم', price: 21, subjectId: 'spanish', tutorCount: 5 },
  { id: 'spanish-expert', name: 'Expert', nameAr: 'خبير', price: 23, subjectId: 'spanish', tutorCount: 4 },

  { id: 'german-beginner', name: 'Beginner', nameAr: 'مبتدئ', price: 21, subjectId: 'german', tutorCount: 6 },
  { id: 'german-intermediate', name: 'Intermediate', nameAr: 'متوسط', price: 22, subjectId: 'german', isPopular: true, tutorCount: 6 },
  { id: 'german-advanced', name: 'Advanced', nameAr: 'متقدم', price: 23, subjectId: 'german', tutorCount: 5 },
  { id: 'german-expert', name: 'Expert', nameAr: 'خبير', price: 25, subjectId: 'german', tutorCount: 4 },

  { id: 'turkish-beginner', name: 'Beginner', nameAr: 'مبتدئ', price: 19, subjectId: 'turkish', tutorCount: 6 },
  { id: 'turkish-intermediate', name: 'Intermediate', nameAr: 'متوسط', price: 20, subjectId: 'turkish', isPopular: true, tutorCount: 6 },
  { id: 'turkish-advanced', name: 'Advanced', nameAr: 'متقدم', price: 21, subjectId: 'turkish', tutorCount: 5 },
  { id: 'turkish-expert', name: 'Expert', nameAr: 'خبير', price: 23, subjectId: 'turkish', tutorCount: 4 },

  { id: 'chinese-beginner', name: 'Beginner', nameAr: 'مبتدئ', price: 22, subjectId: 'chinese', tutorCount: 6 },
  { id: 'chinese-intermediate', name: 'Intermediate', nameAr: 'متوسط', price: 23, subjectId: 'chinese', isPopular: true, tutorCount: 6 },
  { id: 'chinese-advanced', name: 'Advanced', nameAr: 'متقدم', price: 24, subjectId: 'chinese', tutorCount: 5 },
  { id: 'chinese-expert', name: 'Expert', nameAr: 'خبير', price: 26, subjectId: 'chinese', tutorCount: 4 },

  { id: 'russian-beginner', name: 'Beginner', nameAr: 'مبتدئ', price: 20, subjectId: 'russian', tutorCount: 6 },
  { id: 'russian-intermediate', name: 'Intermediate', nameAr: 'متوسط', price: 21, subjectId: 'russian', isPopular: true, tutorCount: 6 },
  { id: 'russian-advanced', name: 'Advanced', nameAr: 'متقدم', price: 22, subjectId: 'russian', tutorCount: 5 },
  { id: 'russian-expert', name: 'Expert', nameAr: 'خبير', price: 24, subjectId: 'russian', tutorCount: 4 },

  { id: 'comm-speaking', name: 'Public Speaking', nameAr: 'فن الخطابة والإلقاء', price: 18, subjectId: 'communication-skills', tutorCount: 8 },
  { id: 'comm-admin', name: 'Administrative Writing', nameAr: 'التحرير الإداري', price: 18, subjectId: 'communication-skills', tutorCount: 8 },
  { id: 'comm-translation', name: 'Translation', nameAr: 'الترجمة', price: 20, subjectId: 'communication-skills', isPopular: true, tutorCount: 7 },
  { id: 'comm-digital', name: 'Digital Communication', nameAr: 'التواصل الرقمي', price: 19, subjectId: 'communication-skills', tutorCount: 7 },
  { id: 'comm-body', name: 'Body Language', nameAr: 'لغة الجسد', price: 18, subjectId: 'communication-skills', tutorCount: 7 },

  { id: 'think-critical', name: 'Critical Thinking', nameAr: 'التفكير النقدي', price: 18, subjectId: 'thinking-skills', isPopular: true, tutorCount: 8 },
  { id: 'think-creative', name: 'Creative Thinking', nameAr: 'التفكير الإبداعي', price: 18, subjectId: 'thinking-skills', tutorCount: 8 },
  { id: 'think-problem', name: 'Problem Solving', nameAr: 'حل المشكلات', price: 19, subjectId: 'thinking-skills', tutorCount: 8 },
  { id: 'think-strategy', name: 'Strategic Thinking', nameAr: 'التفكير الاستراتيجي', price: 20, subjectId: 'thinking-skills', tutorCount: 7 },

  { id: 'self-time', name: 'Time Management', nameAr: 'إدارة الوقت', price: 18, subjectId: 'self-management', isPopular: true, tutorCount: 9 },
  { id: 'self-goals', name: 'Goal Setting', nameAr: 'تحديد الأهداف', price: 18, subjectId: 'self-management', tutorCount: 9 },
  { id: 'self-stress', name: 'Stress Management', nameAr: 'إدارة الضغوط', price: 18, subjectId: 'self-management', tutorCount: 8 },
  { id: 'self-habits', name: 'Habit Building', nameAr: 'بناء العادات', price: 19, subjectId: 'self-management', tutorCount: 8 },
  { id: 'self-learning', name: 'Self Learning', nameAr: 'التعلم الذاتي', price: 19, subjectId: 'self-management', tutorCount: 8 },

  { id: 'social-eq', name: 'Emotional Intelligence', nameAr: 'الذكاء العاطفي', price: 18, subjectId: 'social-skills', isPopular: true, tutorCount: 8 },
  { id: 'social-leadership', name: 'Leadership', nameAr: 'القيادة', price: 19, subjectId: 'social-skills', tutorCount: 8 },
  { id: 'social-team', name: 'Teamwork', nameAr: 'العمل الجماعي', price: 18, subjectId: 'social-skills', tutorCount: 8 },
  { id: 'social-negotiation', name: 'Negotiation', nameAr: 'التفاوض', price: 19, subjectId: 'social-skills', tutorCount: 7 },
  { id: 'social-relations', name: 'Relationship Building', nameAr: 'بناء العلاقات', price: 18, subjectId: 'social-skills', tutorCount: 7 },

  { id: 'career-self', name: 'Self Discovery', nameAr: 'اكتشاف الذات', price: 20, subjectId: 'career-planning', tutorCount: 7 },
  { id: 'career-cv', name: 'CV Writing', nameAr: 'كتابة السيرة الذاتية', price: 20, subjectId: 'career-planning', isPopular: true, tutorCount: 8 },
  { id: 'career-interviews', name: 'Interviews', nameAr: 'المقابلات', price: 20, subjectId: 'career-planning', tutorCount: 7 },
  { id: 'career-entrepreneur', name: 'Entrepreneurship', nameAr: 'ريادة الأعمال', price: 22, subjectId: 'career-planning', tutorCount: 7 },
  { id: 'career-finance', name: 'Financial Literacy', nameAr: 'الثقافة المالية', price: 20, subjectId: 'career-planning', tutorCount: 7 },

  { id: 'health-nutrition', name: 'Nutrition', nameAr: 'التغذية', price: 16, subjectId: 'health-safety', tutorCount: 7 },
  { id: 'health-mental', name: 'Mental Health', nameAr: 'الصحة النفسية', price: 18, subjectId: 'health-safety', isPopular: true, tutorCount: 8 },
  { id: 'health-firstaid', name: 'First Aid', nameAr: 'الإسعافات الأولية', price: 18, subjectId: 'health-safety', tutorCount: 7 },
  { id: 'health-road', name: 'Road Safety', nameAr: 'السلامة المرورية', price: 16, subjectId: 'health-safety', tutorCount: 7 },
];

export const tutors: Tutor[] = [];

export const sampleQuestions: Question[] = [];

const normalizePrice = (price: number) => Math.max(5, Math.min(10, Math.round(price / 5)));

subjects.forEach((subject) => {
  subject.minPrice = normalizePrice(subject.minPrice);
});

levels.forEach((level) => {
  level.price = normalizePrice(level.price);
});

tutors.forEach((tutor) => {
  tutor.hourlyRate = normalizePrice(tutor.hourlyRate);
});

export const getSubjectsByCategory = (categoryId: string) =>
  subjects.filter((s) => s.categoryId === categoryId);

export const getLevelsBySubject = (subjectId: string) =>
  levels.filter((l) => l.subjectId === subjectId);

export const getTutorsByLevel = (levelId: string) =>
  tutors.filter((t) => t.levelId === levelId || t.category === 'school');

export const getCategoryById = (id: string) =>
  categories.find((c) => c.id === id);

export const getSubjectById = (id: string) =>
  subjects.find((s) => s.id === id);

export const getLevelById = (id: string) =>
  levels.find((l) => l.id === id);

export const getTutorById = (id: string) =>
  tutors.find((t) => t.id === id);
