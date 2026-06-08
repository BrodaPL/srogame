export const authPl = {
  eyebrow: 'Konto',
  title: 'Logowanie lub Rejestracja',
  subtitle: 'Uzyj nazwy gracza, aby uzyskac dostep do serwera. Nowe konta wymagaja potwierdzenia email przed logowaniem.',
  sections: {
    login: 'Logowanie',
    register: 'Rejestracja',
    resendConfirmation: 'Ponow potwierdzenie'
  },
  fields: {
    playerName: 'Nazwa gracza',
    password: 'Haslo',
    email: 'Email',
    confirmPassword: 'Potwierdz haslo',
    captcha: 'CAPTCHA'
  },
  placeholders: {
    playerName: 'Dowodca',
    email: 'dowodca@example.com',
    password: '********'
  },
  actions: {
    login: 'Zaloguj',
    loggingIn: 'Logowanie...',
    createAccount: 'Utworz konto',
    creatingAccount: 'Tworzenie konta...',
    resendConfirmation: 'Ponow potwierdzenie',
    sending: 'Wysylanie...'
  },
  resend: {
    subtitle: 'Uzyj emaila rejestracyjnego dla niepotwierdzonego konta. To odswieza okno potwierdzenia, ale aktywacja nadal jest na razie reczna na tym serwerze.'
  },
  errors: {
    loadRegisterConfig: 'Nie udalo sie wczytac konfiguracji rejestracji.',
    loginRequiresCredentials: 'Nazwa gracza i haslo sa wymagane.',
    registerUnavailable: 'Rejestracja jest obecnie niedostepna.',
    registerRequiresFields: 'Nazwa gracza, email i haslo sa wymagane.',
    registerPasswordsMismatch: 'Hasla nie sa zgodne.',
    registerCaptchaRequired: 'Uzupelnij wyzwanie CAPTCHA.',
    resendEmailRequired: 'Email jest wymagany.',
    turnstileLoad: 'Nie udalo sie zaladowac CAPTCHA. Odswiez strone i sprobuj ponownie.',
    loginFailed: 'Logowanie nie powiodlo sie.',
    registerFailed: 'Rejestracja nie powiodla sie.',
    resendFailed: 'Nie udalo sie ponownie wyslac potwierdzenia.'
  }
} as const;
