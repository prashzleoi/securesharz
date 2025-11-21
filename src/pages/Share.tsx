import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Link, Upload, Clock, Shield, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Share = () => {
  const navigate = useNavigate();
  const [urn, setUrn] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string>("");
  
  // Form state
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState(1440); // 24 hours default
  const [maxAccess, setMaxAccess] = useState<number | undefined>();

  useEffect(() => {
    initializeUrn();
  }, []);

  const initializeUrn = async () => {
    // Check if URN exists in cookie
    const cookies = document.cookie.split(';');
    const urnCookie = cookies.find(c => c.trim().startsWith('urn='));
    
    if (urnCookie) {
      const urnValue = urnCookie.split('=')[1];
      setUrn(urnValue);
    } else {
      // Generate new URN
      await generateUrn();
    }
  };

  const generateUrn = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-urn', {
        body: {},
      });

      if (error) throw error;

      setUrn(data.urn);
      toast.success("Secure identity created");
    } catch (error) {
      console.error('Error generating URN:', error);
      toast.error("Failed to create secure identity");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Check file size (40 MB limit for optimal performance)
      const maxSize = 40 * 1024 * 1024; // 40MB
      if (selectedFile.size > maxSize) {
        toast.error(`File size must be less than 40 MB. Your file is ${Math.round(selectedFile.size / 1024 / 1024)} MB`);
        return;
      }
      
      setFile(selectedFile);
      if (!title) setTitle(selectedFile.name);
    }
  };

  const handleShare = async (type: 'url' | 'file') => {
    if (!urn) {
      toast.error("Secure identity not initialized");
      return;
    }

    if (!password || password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (!title) {
      toast.error("Please provide a title");
      return;
    }

    if (type === 'url' && !url) {
      toast.error("Please enter a URL");
      return;
    }

    if (type === 'file' && !file) {
      toast.error("Please select a file");
      return;
    }

    setLoading(true);

    try {
      let requestBody: any = {
        urn,
        password,
        title,
        expiryMinutes,
        customSlug: customSlug || undefined,
        maxAccessCount: maxAccess,
      };

      if (type === 'url') {
        requestBody.content = url;
      } else if (file) {
        // Convert file to base64
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const base64Data = fileData.split(',')[1];
        requestBody.file = {
          data: base64Data,
          name: file.name,
          type: file.type,
        };
      }

      const { data, error } = await supabase.functions.invoke('create-share', {
        body: requestBody,
      });

      if (error) throw error;

      setShareLink(data.shareLink);
      toast.success("Share link created successfully!");
      
      // Reset form
      setUrl("");
      setFile(null);
      setPassword("");
      setTitle("");
      setCustomSlug("");
    } catch (error: any) {
      console.error('Error creating share:', error);
      toast.error(error.message || "Failed to create share link");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    toast.success("Link copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            SecureSharz
          </h1>
          <Button variant="outline" onClick={() => navigate('/history')}>
            View History
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold mb-2">Share Securely & Anonymously</h2>
          <p className="text-muted-foreground">
            Upload files or share links with end-to-end encryption. No login required.
          </p>
        </div>

        {shareLink ? (
          <Card className="p-6 bg-secondary/10">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Your secure share link is ready!</h3>
            </div>
            <div className="flex gap-2">
              <Input value={shareLink} readOnly className="flex-1" />
              <Button onClick={copyLink}>
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setShareLink("")} 
              className="mt-4 w-full"
            >
              Create Another
            </Button>
          </Card>
        ) : (
          <Card className="p-6">
            <Tabs defaultValue="url">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="url">
                  <Link className="w-4 h-4 mr-2" />
                  Share URL
                </TabsTrigger>
                <TabsTrigger value="file">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload File
                </TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="space-y-4">
                <div>
                  <Label htmlFor="url">URL to Share</Label>
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="url-title">Title</Label>
                  <Input
                    id="url-title"
                    placeholder="Give your share a title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="url-password">Password</Label>
                  <Input
                    id="url-password"
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="expiry">Expiry Time (minutes)</Label>
                    <Input
                      id="expiry"
                      type="number"
                      min="10"
                      max="2880"
                      value={expiryMinutes}
                      onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="max-access">Max Access Count (optional)</Label>
                    <Input
                      id="max-access"
                      type="number"
                      min="1"
                      placeholder="Unlimited"
                      value={maxAccess || ""}
                      onChange={(e) => setMaxAccess(e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="custom-slug">Custom Link (optional)</Label>
                  <Input
                    id="custom-slug"
                    placeholder="my-custom-link"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                  />
                </div>

                <Button 
                  onClick={() => handleShare('url')} 
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? "Creating..." : "Create Secure Share Link"}
                </Button>
              </TabsContent>

              <TabsContent value="file" className="space-y-4">
                <div>
                  <Label htmlFor="file">Select File (up to 40 MB)</Label>
                  <Input
                    id="file"
                    type="file"
                    onChange={handleFileChange}
                  />
                  {file && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="file-title">Title</Label>
                  <Input
                    id="file-title"
                    placeholder="Give your share a title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="file-password">Password</Label>
                  <Input
                    id="file-password"
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="file-expiry">Expiry Time (minutes)</Label>
                    <Input
                      id="file-expiry"
                      type="number"
                      min="10"
                      max="2880"
                      value={expiryMinutes}
                      onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="file-max-access">Max Access Count (optional)</Label>
                    <Input
                      id="file-max-access"
                      type="number"
                      min="1"
                      placeholder="Unlimited"
                      value={maxAccess || ""}
                      onChange={(e) => setMaxAccess(e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="file-custom-slug">Custom Link (optional)</Label>
                  <Input
                    id="file-custom-slug"
                    placeholder="my-custom-link"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                  />
                </div>

                <Button 
                  onClick={() => handleShare('file')} 
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? "Uploading..." : "Upload & Create Share Link"}
                </Button>
              </TabsContent>
            </Tabs>
          </Card>
        )}

        <div className="mt-8 grid md:grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <Shield className="w-8 h-8 mx-auto mb-2 text-primary" />
            <h3 className="font-semibold mb-1">End-to-End Encrypted</h3>
            <p className="text-sm text-muted-foreground">
              Your content is encrypted before leaving your device
            </p>
          </Card>
          <Card className="p-4 text-center">
            <Clock className="w-8 h-8 mx-auto mb-2 text-primary" />
            <h3 className="font-semibold mb-1">Auto-Expiring</h3>
            <p className="text-sm text-muted-foreground">
              Links expire automatically after set time
            </p>
          </Card>
          <Card className="p-4 text-center">
            <Link className="w-8 h-8 mx-auto mb-2 text-primary" />
            <h3 className="font-semibold mb-1">No Login Required</h3>
            <p className="text-sm text-muted-foreground">
              Share securely without creating an account
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Share;
