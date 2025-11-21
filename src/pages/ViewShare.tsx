import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, Download, ExternalLink, Clock, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ViewShare = () => {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [shareData, setShareData] = useState<any>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

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
        // Extract detailed error message from edge function response
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
      
      // If it's an image, create blob URL for inline display
      if (data.fileData && data.contentType?.startsWith('image/')) {
        const byteCharacters = atob(data.fileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: data.contentType });
        const url = window.URL.createObjectURL(blob);
        setImageUrl(url);
      }
      
      toast.success("Content unlocked successfully!");
    } catch (error: any) {
      console.error('Error unlocking share:', error);
      toast.error(error.message || "Incorrect password or share not found");
    } finally {
      setLoading(false);
    }
  };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) {
        window.URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const handleDownload = () => {
    if (!shareData.fileData) return;

    const byteCharacters = atob(shareData.fileData);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: shareData.contentType });
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = shareData.fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    toast.success("File downloaded!");
  };

  const openUrl = () => {
    if (shareData.content) {
      window.open(shareData.content, '_blank');
    }
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
            This content is password protected
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
            </div>

            {shareData.content && (
              <Button onClick={openUrl} className="w-full">
                <ExternalLink className="w-4 h-4 mr-2" />
                Open URL
              </Button>
            )}

            {imageUrl && shareData.contentType?.startsWith('image/') && (
              <div className="rounded-lg overflow-hidden border border-border">
                <img 
                  src={imageUrl} 
                  alt={shareData.fileName} 
                  className="w-full h-auto max-h-96 object-contain bg-secondary/5"
                />
              </div>
            )}

            {shareData.fileData && (
              <Button onClick={handleDownload} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                Download {shareData.contentType?.startsWith('image/') ? 'Image' : 'File'}
              </Button>
            )}

            <Button 
              variant="outline" 
              onClick={() => navigate('/')}
              className="w-full"
            >
              Create Your Own Secure Share
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ViewShare;
