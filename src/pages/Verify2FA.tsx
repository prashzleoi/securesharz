import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { TwoFactorVerify } from '@/components/TwoFactorVerify';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function Verify2FA() {
  const navigate = useNavigate();
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    // Check if there's a pending 2FA verification
    const pendingUser = sessionStorage.getItem('pending_2fa_user');
    if (!pendingUser) {
      navigate('/auth');
      return;
    }
    setIsValid(true);
  }, [navigate]);

  const handleSuccess = () => {
    sessionStorage.removeItem('pending_2fa_user');
    navigate('/dashboard');
  };

  const handleCancel = async () => {
    sessionStorage.removeItem('pending_2fa_user');
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (!isValid) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4">
        <TwoFactorVerify onSuccess={handleSuccess} onCancel={handleCancel} />
      </main>
      <Footer />
    </div>
  );
}
