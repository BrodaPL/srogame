export const authEn = {
  eyebrow: 'Account',
  title: 'Login or Register',
  subtitle: 'Use your player name to access the server. New accounts require email confirmation before login.',
  sections: {
    login: 'Login',
    register: 'Register',
    resendConfirmation: 'Resend confirmation'
  },
  fields: {
    playerName: 'Player name',
    password: 'Password',
    email: 'Email',
    confirmPassword: 'Confirm password',
    captcha: 'CAPTCHA'
  },
  placeholders: {
    playerName: 'Commander',
    email: 'commander@example.com',
    password: '********'
  },
  actions: {
    login: 'Log in',
    loggingIn: 'Logging in...',
    createAccount: 'Create account',
    creatingAccount: 'Creating account...',
    resendConfirmation: 'Resend confirmation',
    sending: 'Sending...'
  },
  resend: {
    subtitle: 'Use the registration email for an unconfirmed account. This refreshes the pending confirmation window, but activation is still manual on this server for now.'
  },
  errors: {
    loadRegisterConfig: 'Unable to load registration configuration.',
    loginRequiresCredentials: 'Player name and password are required.',
    registerUnavailable: 'Registration is unavailable right now.',
    registerRequiresFields: 'Player name, email, and password are required.',
    registerPasswordsMismatch: 'Passwords do not match.',
    registerCaptchaRequired: 'Please complete the CAPTCHA challenge.',
    resendEmailRequired: 'Email is required.',
    turnstileLoad: 'CAPTCHA failed to load. Refresh the page and try again.',
    loginFailed: 'Login failed.',
    registerFailed: 'Registration failed.',
    resendFailed: 'Unable to resend confirmation.'
  }
} as const;
