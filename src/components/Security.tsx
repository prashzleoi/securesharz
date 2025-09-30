import { Lock, Eye, Code, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const Security = () => {
  const trustPoints = [
    {
      icon: Lock,
      title: "We don't store keys",
      description: "The encryption key is placed in the browser-only URL fragment (#key) and never transmitted to our server.",
    },
    {
      icon: Eye,
      title: "Sanitization first",
      description: "We remove scripts, inline event handlers, iframes, and known tracking tags before encryption.",
    },
    {
      icon: FileCheck,
      title: "No accounts required",
      description: "You don't need email or phone to use SecureShare. Start sharing securely in seconds.",
    },
    {
      icon: Code,
      title: "Open & auditable",
      description: "The extension and server are open-source so third parties can confirm our security claims.",
    },
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-secondary/10 text-secondary rounded-full text-sm font-medium mb-6">
              <Shield className="w-4 h-4" />
              <span>Independently audited</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Trust, explained simply
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              We never see your unencrypted content. The key stays with you (in the link). 
              You can self-host for maximum control.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {trustPoints.map((point, idx) => {
              const Icon = point.icon;
              return (
                <div
                  key={idx}
                  className="bg-card rounded-2xl p-8 border border-border shadow-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-secondary/10 rounded-xl flex-shrink-0">
                      <Icon className="w-6 h-6 text-secondary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold mb-2">{point.title}</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        {point.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-3xl p-8 md:p-12 border border-border">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1">
                <h3 className="text-2xl md:text-3xl font-bold mb-4">
                  Want maximum control?
                </h3>
                <p className="text-muted-foreground text-lg mb-6">
                  Self-host SecureShare on your own infrastructure. One-click deploy or use Docker.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Button variant="hero">
                    <Server className="w-4 h-4" />
                    Self-Host Guide
                  </Button>
                  <Button variant="outline">
                    View on GitHub
                  </Button>
                </div>
              </div>
              <div className="flex gap-4">
                {["Docker", "AWS", "GCP"].map((platform) => (
                  <div
                    key={platform}
                    className="px-6 py-3 bg-card rounded-xl border border-border shadow-sm font-medium"
                  >
                    {platform}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// Import statement for Shield and Server that was missing
import { Shield, Server } from "lucide-react";

export default Security;
