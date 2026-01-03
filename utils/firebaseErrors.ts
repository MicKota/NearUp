export function firebaseErrorMessage(e: any): string {
  const code = e?.code || e?.status || '';
  const message = e?.message || String(e);

  if (typeof code === 'string') {
    switch (code) {
      case 'auth/invalid-email':
      case 'auth/email-already-in-use':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/weak-password':
      case 'auth/too-many-requests':
      case 'auth/requires-recent-login':
        if (code === 'auth/invalid-email') return 'Nieprawidłowy adres e-mail.';
        if (code === 'auth/email-already-in-use') return 'Ten adres e-mail jest już używany.';
        if (code === 'auth/user-not-found') return 'Nie znaleziono konta o podanym e-mailu.';
        if (code === 'auth/wrong-password') return 'Nieprawidłowe hasło.';
        if (code === 'auth/weak-password') return 'Hasło jest zbyt słabe. Wybierz dłuższe hasło.';
        if (code === 'auth/too-many-requests') return 'Zbyt wiele prób. Spróbuj ponownie później.';
        if (code === 'auth/requires-recent-login') return 'W celu wykonania tej operacji, zaloguj się ponownie.';
        break;
      case 'permission-denied':
      case 'deadline-exceeded':
      case 'unavailable':
        if (code === 'permission-denied') return 'Brak uprawnień do wykonania tej operacji.';
        if (code === 'deadline-exceeded') return 'Przekroczono czas połączenia. Spróbuj ponownie.';
        if (code === 'unavailable') return 'Usługa chwilowo niedostępna. Spróbuj ponownie później.';
        break;
      default:
        break;
    }
  }

  if (message.includes('network-request-failed')) return 'Błąd sieci. Sprawdź połączenie internetowe.';
  if (message && message.length < 150) return message;

  return 'Wystąpił błąd. Spróbuj ponownie.';
}
