export type ErrorMessages = Record<string, string | undefined>

const FALLBACK = 'Une erreur est survenue'

export const MessageBackendErrors: ErrorMessages = {
  'EMAIL_ALREADY_EXISTS': 'Cet email existe déjà',
  'INVALID_CREDENTIALS': 'Identifiants invalides',
  'EMAIL_NOT_VERIFIED': 'Ton email n\'est pas vérifié. Vérifie ta boîte mail',
  'INVALID_TOKEN': 'Token invalide',
  'INVALID_VERIFICATION_LINK': 'Lien de vérification invalide',
  'EXPIRED_TOKEN': 'Le lien a expiré. Demande un nouveau lien de vérification.',
  'INVALID_EMAIL_FORMAT': 'Format d\'email invalide',
  'VERIFICATION_EMAIL_RATE_LIMITED': 'Attends quelques minutes avant de demander un nouvel email',
  'EMAIL_ALREADY_VERIFIED': 'Cet email est déjà vérifié',
  'USER_NOT_FOUND': 'Utilisateur introuvable',

  'INTERNAL_ERROR': 'Erreur interne du serveur',
  'Unexpected error': 'Une erreur inattendue est survenue',
  'Too Many Requests': 'Trop de tentatives. Réessaie dans quelques instants.',
  'ThrottlerException: Too Many Requests': 'Trop de tentatives. Réessaie dans quelques instants.',

  // Distinct server errors deliberately collapse to the same vague message:
  // confirming whether an account exists would allow enumeration. Merging these
  // entries as duplicates would reopen that.
  'Password is too short!': 'Le mot de passe doit contenir au moins 8 caractères',
  'Invalid email entered': 'L\'adresse email est invalide',
  'Email already exists!': 'Il y a eu une erreur, choisis une autre adresse email',
  'Invalid name entered': 'Le pseudo est invalide',
  'Empty input fields!': 'Remplis tous les champs',
  'Invalid credentials entereds!': 'Les identifiants sont invalides',
  'Invalid password entered!': 'Le mot de passe est invalide',
  'Empty credentials supplied!': 'Remplis tous les champs',
  'An error occured while checking for existing user': 'Les identifiants sont invalides',
  'Email sent!': 'Tu n\'as pas encore confirmé ton adresse email, vérifie ta boîte mail',
  'User dont exist with that email': 'L\'adresse email est invalide',

  'Invalid class code': 'Code classe invalide',
  'Invalid class code format': 'Format de code classe invalide',
  'Class is full': 'La classe est complète',
  'You are already in a class. Leave your current class first.': 'Tu es déjà dans une classe. Quitte-la d\'abord.',
  'You are already in this class': 'Tu es déjà dans cette classe',
  'You are not in a class': 'Tu n\'es pas dans une classe',
  'Class not found': 'Classe introuvable',
  'You do not own this class': 'Tu n\'es pas le propriétaire de cette classe',
}

export function translateError(key?: string | null): string {
  return (key && MessageBackendErrors[key]) || FALLBACK
}
