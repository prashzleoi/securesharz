import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, ExternalLink, Clock, Eye, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ViewShare = () => {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [shareData, setShareData] = useState<any>(null);
  const [contentUrl, setContentUrl] = useState<string | null>(null);

  // Cleanup function to revoke URLs and clear data
  const cleanupContent = () => {
    if (contentUrl) {
      window.URL.revokeObjectURL(contentUrl);
      setContentUrl(null);
    }
    setShareData(null);
    setUnlocked(false);
  };

  // Auto-check expiry while viewing
  useEffect(() => {
    if (!shareData?.expiresAt || !unlocked) return;
    
    const checkExpiry = () => {
      if (new Date(shareData.expiresAt) < new Date()) {
        toast.error("This share has expired and has been cleared");
        cleanupContent();
      }
    };

    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, [shareData?.expiresAt, unlocked, contentUrl]);

  // Cleanup on page unload/navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupContent();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // User switched tabs or minimized - clear content for security
        cleanupContent();
        toast.info("Content cleared for security");
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cleanupContent();
    };
  }, [contentUrl]);

  // Prevent context menu, screenshots, and print
  useEffect(() => {
    if (!unlocked) return;

    const preventActions = (e: Event) => {
      e.preventDefault();
      return false;
    };

    const preventKeyboardShortcuts = (e: KeyboardEvent) => {
      // Prevent PrintScreen, Cmd+Shift+3/4 (Mac), Windows+PrintScreen
      if (
        e.key === 'PrintScreen' ||
        (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')) ||
        (e.metaKey && e.key === 'p') || // Cmd/Ctrl + P (print)
        (e.ctrlKey && e.key === 'p')
      ) {
        e.preventDefault();
        toast.error("Screenshots and printing are disabled for security");
        return false;
      }
    };

    // Disable context menu
    document.addEventListener('contextmenu', preventActions);
    
    // Disable keyboard shortcuts
    document.addEventListener('keydown', preventKeyboardShortcuts);
    
    // Disable drag and drop
    document.addEventListener('dragstart', preventActions);
    
    return () => {
      document.removeEventListener('contextmenu', preventActions);
      document.removeEventListener('keydown', preventKeyboardShortcuts);
      document.removeEventListener('dragstart', preventActions);
    };
  }, [unlocked]);

  const handleUnlock = async () => {
    if (!password) {
      toast.error("Please enter the password");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('get-share', {
        body: {
          identifier,
          password,
        },
      });

      if (error) {
        console.error('Error response from get-share:', error);
        const errorMessage = error.message || "Failed to unlock content";
        toast.error(errorMessage);
        return;
      }

      if (!data) {
        toast.error("No data returned from server");
        return;
      }

      setShareData(data);
      setUnlocked(true);
      
      // Create blob URL for inline display (no download option)
      if (data.fileData) {
        const byteCharacters = atob(data.fileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: data.contentType });
        const url = window.URL.createObjectURL(blob);
        setContentUrl(url);
      }
      
      toast.success("Content unlocked - view only mode");
    } catch (error: any) {
      console.error('Error unlocking share:', error);
      toast.error(error.message || "Incorrect password or share not found");
    } finally {
      setLoading(false);
    }
  };

  const openUrl = () => {
    if (shareData.content) {
      window.open(shareData.content, '_blank');
    }
  };

  const renderContent = () => {
    if (!contentUrl || !shareData) return null;

    const contentType = shareData.contentType;

    if (contentType?.startsWith('image/')) {
      return (
        <div 
          className="rounded-lg overflow-hidden border border-border select-none"
          style={{ 
            userSelect: 'none',
            WebkitUserSelect: 'none',
            pointerEvents: 'none'
          }}
        >
          <img 
            src={contentUrl} 
            alt="Protected content"
            className="w-full h-auto max-h-96 object-contain bg-secondary/5"
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
            style={{
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none'
            }}
          />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-transparent via-transparent to-primary/5" />
        </div>
      );
    }

    if (contentType === 'application/pdf') {
      return (
        <div className="rounded-lg overflow-hidden border border-border bg-secondary/5">
          <iframe 
            src={`${contentUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            title="Protected PDF"
            className="w-full h-[600px]"
            style={{ 
              border: 'none',
              pointerEvents: 'auto'
            }}
            sandbox="allow-same-origin"
          />
        </div>
      );
    }

    if (contentType?.includes('zip') || contentType?.includes('compressed')) {
      return (
        <div className="rounded-lg border border-border bg-secondary/5 p-6 text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-primary" />
          <p className="text-lg font-semibold mb-2">Compressed File</p>
          <p className="text-sm text-muted-foreground">
            {shareData.fileName}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            View-only mode - Downloads disabled for security
          </p>
        </div>
      );
    }

    // Generic file preview
    return (
      <div className="rounded-lg border border-border bg-secondary/5 p-6 text-center">
        <Shield className="w-12 h-12 mx-auto mb-4 text-primary" />
        <p className="text-lg font-semibold mb-2">Protected File</p>
        <p className="text-sm text-muted-foreground">
          {shareData.fileName}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          File type: {contentType || 'Unknown'}
        </p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Secure Share</h1>
          <p className="text-muted-foreground">
            {unlocked ? "View-only mode - Screenshots & downloads disabled" : "This content is password protected"}
          </p>
        </div>

        {!unlocked ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="password">Enter Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
              />
            </div>
            <Button 
              onClick={handleUnlock} 
              disabled={loading}
              className="w-full"
            >
              {loading ? "Unlocking..." : "Unlock Content"}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate('/')}
              className="w-full"
            >
              Back to Home
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-secondary/10 rounded-lg p-4">
              <h3 className="font-semibold mb-2">{shareData.title}</h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>Expires: {new Date(shareData.expiresAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>Views: {shareData.accessCount}{shareData.maxAccessCount ? `/${shareData.maxAccessCount}` : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500 mt-2">
                <Shield className="w-3 h-3" />
                <span>Protected: Screenshots & downloads disabled</span>
              </div>
            </div>

            {shareData.content && (
              <Button onClick={openUrl} className="w-full">
                <ExternalLink className="w-4 h-4 mr-2" />
                Open URL
              </Button>
            )}

            {renderContent()}

            <Button 
              variant="outline" 
              onClick={() => {
                cleanupContent();
                navigate('/');
              }}
              className="w-full"
            >
              Clear & Create Your Own Secure Share
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ViewShare;
