import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, Clock, Eye, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ShareItem {
  id: string;
  title: string;
  share_token: string;
  custom_slug: string | null;
  created_at: string;
  expires_at: string;
  access_count: number;
  max_access_count: number | null;
  content_type: string | null;
}

const History = () => {
  const navigate = useNavigate();
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [urn, setUrn] = useState<string>("");

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      // Get URN from cookie
      const cookies = document.cookie.split(';');
      const urnCookie = cookies.find(c => c.trim().startsWith('urn='));
      
      if (!urnCookie) {
        toast.error("No secure identity found. Please create a share first.");
        navigate('/share');
        return;
      }

      const urnValue = urnCookie.split('=')[1];
      setUrn(urnValue);

      // Fetch URN ID
      const { data: urnData, error: urnError } = await supabase
        .from('urns')
        .select('id')
        .eq('urn', urnValue)
        .single();

      if (urnError || !urnData) {
        throw new Error('Invalid URN');
      }

      // Fetch shares for this URN
      const { data, error } = await supabase
        .from('shared_pages')
        .select('*')
        .eq('urn_id', urnData.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setShares(data || []);
    } catch (error) {
      console.error('Error loading history:', error);
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = (item: ShareItem) => {
    const link = item.custom_slug
      ? `${window.location.origin}/s/${item.custom_slug}`
      : `${window.location.origin}/s/${item.share_token}`;
    
    navigator.clipboard.writeText(link);
    toast.success("Link copied to clipboard!");
  };

  const deleteShare = async (id: string) => {
    try {
      const { error } = await supabase
        .from('shared_pages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast.success("Share deleted");
      loadHistory();
    } catch (error) {
      console.error('Error deleting share:', error);
      toast.error("Failed to delete share");
    }
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            SecureSharz
          </h1>
          <Button onClick={() => navigate('/share')}>
            Create New Share
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Your Share History</h2>
          <p className="text-muted-foreground">
            View and manage all your encrypted shares
          </p>
        </div>

        {loading ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Loading history...</p>
          </Card>
        ) : shares.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No shares yet</p>
            <Button onClick={() => navigate('/share')}>
              Create Your First Share
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {shares.map((item) => (
              <Card key={item.id} className={`p-4 ${isExpired(item.expires_at) ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">{item.title}</h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {isExpired(item.expires_at) 
                            ? 'Expired' 
                            : `Expires: ${new Date(item.expires_at).toLocaleString()}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        <span>
                          Views: {item.access_count}
                          {item.max_access_count ? `/${item.max_access_count}` : ''}
                        </span>
                      </div>
                      {item.content_type && (
                        <span className="px-2 py-1 bg-secondary/20 rounded text-xs">
                          {item.content_type.split('/')[0]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Created: {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyLink(item)}
                      disabled={isExpired(item.expires_at)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteShare(item.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default History;
