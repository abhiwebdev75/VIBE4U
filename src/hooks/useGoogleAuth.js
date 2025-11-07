import { useAuth } from '../contexts/AuthContext';

export const useGoogleAuth = () => {
  const { loginWithGoogle } = useAuth();

  const openGoogleOAuth = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = encodeURIComponent(window.location.origin);
    const scope = encodeURIComponent('https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email');
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&access_type=offline` +
      `&prompt=consent`;

    const width = 500;
    const height = 600;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const popup = window.open(
      authUrl,
      'Google OAuth',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    return new Promise((resolve, reject) => {
      const checkPopup = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(checkPopup);
          reject(new Error('Popup closed by user'));
          return;
        }

        try {
          const url = new URL(popup.location.href);
          const code = url.searchParams.get('code');
          
          if (code) {
            clearInterval(checkPopup);
            popup.close();
            resolve(code);
          }
        } catch (error) {
          // Cross-origin error, ignore
        }
      }, 100);
    });
  };

  const handleGoogleLogin = async () => {
    try {
      const code = await openGoogleOAuth();
      await loginWithGoogle(code);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  return { handleGoogleLogin };
};