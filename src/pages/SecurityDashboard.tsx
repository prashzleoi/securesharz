import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, Lock, Activity, Database, Clock } from "lucide-react";
import { toast } from "sonner";

interface SecurityMetrics {
  total_shares: number;
  active_shares: number;
  expired_shares: number;
  total_accesses: number;
  total_urns: number;
  recent_failures: number;
  rate_limit_hits: number;
  failed_passwords: number;
  storage_used_mb: number;
  encryption_distribution: Record<string, number>;
}

interface AuditLog {
  id: string;
  event_type: string;
  event_category: string;
  severity: string;
  ip_address: string | null;
  metadata: any;
  created_at: string;
}

export default function SecurityDashboard() {
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const fetchSecurityData = async () => {
    try {
      // Fetch metrics
      const { data: metricsData, error: metricsError } = await supabase.rpc('get_security_metrics');
      
      if (metricsError) throw metricsError;
      setMetrics(metricsData as unknown as SecurityMetrics);

      // Fetch recent audit logs
      const { data: logsData, error: logsError } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (logsError) throw logsError;
      setAuditLogs(logsData || []);
    } catch (error: any) {
      console.error('Error fetching security data:', error);
      toast.error('Failed to load security data');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'error': return 'destructive';
      case 'warning': return 'default';
      case 'info': return 'secondary';
      default: return 'secondary';
    }
  };

  const getEventIcon = (category: string) => {
    switch (category) {
      case 'authentication': return <Lock className="h-4 w-4" />;
      case 'access_control': return <Shield className="h-4 w-4" />;
      case 'access_attempt': return <Activity className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Security Dashboard
          </h1>
          <p className="text-muted-foreground">
            Real-time security monitoring and audit logs for your shares
          </p>
        </div>

        {/* Security Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Shares</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.total_shares || 0}</div>
              <p className="text-xs text-muted-foreground">
                {metrics?.active_shares || 0} active, {metrics?.expired_shares || 0} expired
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Accesses</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.total_accesses || 0}</div>
              <p className="text-xs text-muted-foreground">
                Across all shares
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed Attempts (24h)</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.failed_passwords || 0}</div>
              <p className="text-xs text-muted-foreground">
                Password failures
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rate Limits (24h)</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.rate_limit_hits || 0}</div>
              <p className="text-xs text-muted-foreground">
                Blocked attempts
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Encryption Distribution */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Encryption Methods</CardTitle>
            <CardDescription>Distribution of encryption algorithms in use</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {metrics?.encryption_distribution && Object.entries(metrics.encryption_distribution).map(([algorithm, count]) => (
                <Badge key={algorithm} variant={algorithm === 'AES-256-GCM' ? 'default' : 'secondary'}>
                  {algorithm}: {count}
                </Badge>
              ))}
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              <p><strong>Storage Used:</strong> {metrics?.storage_used_mb || 0} MB</p>
              <p className="mt-1"><strong>Active URNs:</strong> {metrics?.total_urns || 0}</p>
            </div>
          </CardContent>
        </Card>

        {/* Audit Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Last 50 security events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {auditLogs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No security events recorded yet</p>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="mt-1">
                      {getEventIcon(log.event_category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{log.event_type.replace(/_/g, ' ')}</span>
                        <Badge variant={getSeverityColor(log.severity) as any} className="text-xs">
                          {log.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {log.ip_address && `IP: ${log.ip_address} • `}
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {JSON.stringify(log.metadata, null, 2).slice(0, 100)}...
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
