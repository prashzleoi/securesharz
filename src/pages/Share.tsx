import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Link, Upload, Copy, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";

const Share = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
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
    // Check authentication
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/auth");
      } else if (session) {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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
    if (!user) {
      toast.error("Please sign in to create shares");
      navigate("/auth");
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

    // Validate expiry time
    if (expiryMinutes < 10) {
      toast.error("Expiry must be at least 10 minutes");
      setExpiryMinutes(10);
      return;
    }

    if (expiryMinutes > 2880) {
      toast.error("Expiry cannot exceed 2 days (2880 minutes)");
      setExpiryMinutes(2880);
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

      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      const { data, error } = await supabase.functions.invoke('create-share', {
        body: requestBody,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
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
      
      // Parse error message from backend
      let errorMessage = "Failed to create share link";
      
      if (error?.message) {
        errorMessage = error.message;
      }
      
      // Extract error from FunctionsHttpError response
      if (error?.context?.body) {
        try {
          const errorBody = typeof error.context.body === 'string' 
            ? JSON.parse(error.context.body)
            : error.context.body;
          
          if (errorBody?.error) {
            errorMessage = errorBody.error;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    toast.success("Link copied to clipboard!");
  };

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-12 max-w-4xl mt-16">
        <div className="mb-12 text-center space-y-4">
          <h2 className="text-4xl md:text-5xl font-display font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
            Share Securely
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload files or share links with end-to-end AES-256-GCM encryption
          </p>
        </div>

        {shareLink ? (
          <Card className="p-8 bg-gradient-to-br from-card to-muted border-primary/20 shadow-glow">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-display font-semibold">Your secure share link is ready!</h3>
            </div>
            <div className="flex gap-2 mb-4">
              <Input value={shareLink} readOnly className="flex-1 font-mono text-sm" />
              <Button onClick={copyLink} variant="default">
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
          <Card className="p-8 bg-gradient-to-br from-card to-muted border-primary/20 shadow-card">
            <Tabs defaultValue="url">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="url" className="font-medium">
                  <Link className="w-4 h-4 mr-2" />
                  Share URL
                </TabsTrigger>
                <TabsTrigger value="file" className="font-medium">
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
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="expiry">Expiry Time (minutes)</Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setExpiryMinutes(60)}
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-primary/20 transition-colors"
                      >
                        1hr
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpiryMinutes(1440)}
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-primary/20 transition-colors"
                      >
                        24hr
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpiryMinutes(2880)}
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-primary/20 transition-colors"
                      >
                        2d
                      </button>
                    </div>
                  </div>
                  <Input
                    id="expiry"
                    type="number"
                    min="10"
                    max="2880"
                    value={expiryMinutes}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (value >= 10 && value <= 2880) {
                        setExpiryMinutes(value);
                      }
                    }}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (value < 10) {
                        setExpiryMinutes(10);
                        toast.error("Minimum expiry is 10 minutes");
                      } else if (value > 2880) {
                        setExpiryMinutes(2880);
                        toast.error("Maximum expiry is 2 days (2880 minutes)");
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Min: 10 mins, Max: 2 days (2880 mins)</p>
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
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="file-expiry">Expiry Time (minutes)</Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setExpiryMinutes(60)}
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-primary/20 transition-colors"
                      >
                        1hr
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpiryMinutes(1440)}
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-primary/20 transition-colors"
                      >
                        24hr
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpiryMinutes(2880)}
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-primary/20 transition-colors"
                      >
                        2d
                      </button>
                    </div>
                  </div>
                  <Input
                    id="file-expiry"
                    type="number"
                    min="10"
                    max="2880"
                    value={expiryMinutes}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (value >= 10 && value <= 2880) {
                        setExpiryMinutes(value);
                      }
                    }}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (value < 10) {
                        setExpiryMinutes(10);
                        toast.error("Minimum expiry is 10 minutes");
                      } else if (value > 2880) {
                        setExpiryMinutes(2880);
                        toast.error("Maximum expiry is 2 days (2880 minutes)");
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Min: 10 mins, Max: 2 days (2880 mins)</p>
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
                  {loading ? "Creating..." : "Create Secure Share Link"}
                </Button>
              </TabsContent>
            </Tabs>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Share;
