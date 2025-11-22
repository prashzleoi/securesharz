import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { TwoFactorSetup } from '@/components/TwoFactorSetup';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

export default function Security() {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }

    setUser(session.user);
    
    // Check 2FA status
    const { data: profile } = await supabase
      .from('profiles')
      .select('two_factor_enabled')
      .eq('user_id', session.user.id)
      .single();

    setTwoFactorEnabled(profile?.two_factor_enabled || false);
    setLoading(false);
  };

  const handleDisable2FA = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { error } = await supabase.functions.invoke('disable-2fa', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;

      setTwoFactorEnabled(false);
      toast({
        title: '2FA Disabled',
        description: 'Two-factor authentication has been disabled',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Security Settings</h1>
            <p className="text-muted-foreground">
              Manage your account security and authentication methods
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Two-Factor Authentication
              </CardTitle>
              <CardDescription>
                Status: {twoFactorEnabled ? (
                  <span className="inline-flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <XCircle className="h-4 w-4" />
                    Disabled
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!loading && (
                twoFactorEnabled ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Two-factor authentication is currently enabled on your account. This provides an extra layer of security.
                    </p>
                    <Button
                      variant="destructive"
                      onClick={handleDisable2FA}
                      disabled={loading}
                    >
                      Disable 2FA
                    </Button>
                  </div>
                ) : (
                  <TwoFactorSetup onComplete={() => setTwoFactorEnabled(true)} />
                )
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security Best Practices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">✓ Use a strong, unique password</h4>
                <p className="text-sm text-muted-foreground">
                  Avoid using common passwords or reusing passwords from other accounts
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">✓ Enable two-factor authentication</h4>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security with 2FA
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">✓ Keep backup codes safe</h4>
                <p className="text-sm text-muted-foreground">
                  Store your backup codes in a secure location in case you lose access to your authenticator app
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
