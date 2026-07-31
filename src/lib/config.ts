export const CURRENCY_CODE = 'د.ج';
export const CURRENCY_FULL = 'DZD';

export const formatPrice = (priceInDzd: number, lang: 'en' | 'ar' | 'fr' = 'ar'): string => {
  if (lang === 'ar') return `${priceInDzd} د.ج`;
  if (lang === 'fr') return `${priceInDzd} DA`;
  return `${priceInDzd} DZD`;
};


export const translateItem = (lang: 'en' | 'ar' | 'fr', nameEn: string, nameAr: string): string => {
  if (lang === 'ar') return nameAr;
  if (lang === 'fr') {
    const dict: Record<string, string> = {
      'School-Level Education': 'Éducation Scolaire',
      'University & Higher Ed': 'Enseignement Universitaire',
      'Digital Skills': 'Compétences Digitales',
      'Technology & Coding': 'Technologie & Code',
      'Languages & Translation': 'Langues & Traduction',
      'Personal Development': 'Développement Personnel',
      'Elementary Stage': 'Niveau Primaire',
      'Middle School': 'Niveau Moyen (CEM)',
      'High School': 'Niveau Secondaire (Lycée)',
      'Humanities & Social Sciences': 'Sciences Humaines',
      'Languages & Literature': 'Langues & Littérature',
      'Science & Technology': 'Sciences & Technologie',
      'Medical Sciences': 'Sciences Médicales',
      'Economics & Management': 'Économie & Gestion',
      'Law & Political Sciences': 'Droit & Sciences Politiques',
      'Media & Communication': 'Médias & Communication',
      'Digital Foundations': 'Bases du Numérique',
      'Programming & Development': 'Programmation & Développement',
      'Artificial Intelligence': 'Intelligence Artificielle',
      'Digital Creativity': 'Créativité Digitale',
      'Cybersecurity': 'Cybersécurité',
      'Finance Fundamentals': 'Bases de la Finance',
      'FinTech': 'Tech Financière',
      'Arabic': 'Arabe',
      'French': 'Français',
      'English': 'Anglais',
      'Tamazight': 'Tamazight',
      'Spanish': 'Espagnol',
      'German': 'Allemand',
      'Turkish': 'Turc',
      'Chinese': 'Chinois',
      'Russian': 'Russe',
      'Communication Skills': 'Communication',
      'Thinking Skills': 'Esprit Critique',
      'Self Management': 'Gestion de Soi',
      'Social Skills': 'Relations Sociales',
      'Career Planning': 'Projet Professionnel',
      'Health & Safety': 'Santé & Sécurité',
      'Grade 1': '1ère Année',
      'Grade 2': '2ème Année',
      'Grade 3': '3ème Année',
      'Grade 4': '4ème Année',
      'Grade 5': '5ème Année',
      '1st Year Middle School': '1ère Année Moyen',
      '2nd Year Middle School': '2ème Année Moyen',
      '3rd Year Middle School': '3ème Année Moyen',
      '4th Year Middle School (BEM)': '4ème Année Moyen (BEM)',
      'Experimental Sciences': 'Sciences Expérimentales',
      'Mathematics Track': 'Mathématiques',
      'Technical Mathematics': 'Math Technique',
      'Management & Economics': 'Gestion & Économie',
      'Literature & Philosophy': 'Lettres & Philosophie',
      'Foreign Languages': 'Langues Étrangères',
      'Home': 'Accueil',
      'Progress': 'Progrès',
      'Schedule': 'Planning',
      'Profile': 'Profil',
      'Teach Me': 'علمني',
    };
    return dict[nameEn] || nameEn;
  }
  return nameEn;
};
