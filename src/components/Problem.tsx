import { AlertTriangle, Shield } from "lucide-react";

const Problem = () => {
  return (
    <section className="py-16 md:py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 bg-accent/10 rounded-2xl">
              <AlertTriangle className="w-6 h-6 text-accent" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-center">
              Why we built SecureShare
            </h2>
          </div>
          
          <p className="text-lg text-muted-foreground text-center leading-relaxed mb-8">
            Recent leaks and accidental shares have exposed passwords, photos, and private AI replies. 
            Sharing should be simple — and safe. SecureShare gives you a way to share without trusting 
            third-party storage providers.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { number: "2024", label: "Major data leaks" },
              { number: "Millions", label: "Records exposed" },
              { number: "Zero", label: "With SecureShare" },
            ].map((stat, idx) => (
              <div
                key={idx}
                className="bg-card rounded-2xl p-6 text-center border border-border shadow-sm"
              >
                <div className="text-3xl font-bold text-primary mb-2">{stat.number}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-12 p-6 bg-secondary/10 border-l-4 border-secondary rounded-xl">
            <div className="flex items-start gap-4">
              <Shield className="w-6 h-6 text-secondary flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-lg mb-2">Our commitment to privacy</h3>
                <p className="text-muted-foreground">
                  We believe privacy is a fundamental right. That's why we built SecureShare with 
                  zero-knowledge encryption — we literally can't read your content, even if we wanted to.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Problem;
