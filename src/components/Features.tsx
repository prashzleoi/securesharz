import { Shield, Clock, QrCode, Server, Key, Zap } from "lucide-react";

const Features = () => {
  const features = [
    {
      icon: Shield,
      title: "Zero-knowledge hosting",
      description: "Your content is unreadable to us — we store only ciphertext.",
      badge: "Core feature",
    },
    {
      icon: QrCode,
      title: "Clipboard & QR support",
      description: "Copy, QR, or open directly — share however works best for you.",
      badge: "Convenience",
    },
    {
      icon: Sparkles,
      title: "Sanitized previews",
      description: "We remove scripts and trackers automatically for your safety.",
      badge: "Security",
    },
    {
      icon: Server,
      title: "Self-host option",
      description: "Run your own storage server for full control and maximum trust.",
      badge: "Pro",
    },
    {
      icon: Clock,
      title: "Expiry & one-time view",
      description: "Set timeouts or single-view links for extra protection.",
      badge: "Privacy",
    },
    {
      icon: Zap,
      title: "Lightweight & fast",
      description: "Encryption runs in your browser; links open instantly.",
      badge: "Performance",
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Everything you need for secure sharing
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Built with privacy and simplicity at the core
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className="group bg-card rounded-2xl p-8 border border-border shadow-sm hover:shadow-lg transition-all hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-primary/10 rounded-xl group-hover:bg-primary/20 transition-colors">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="text-xs font-medium px-3 py-1 bg-muted rounded-full text-muted-foreground">
                    {feature.badge}
                  </span>
                </div>
                
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// Import statement for Sparkles that was missing
import { Sparkles } from "lucide-react";

export default Features;
