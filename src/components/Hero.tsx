import { Button } from "@/components/ui/button";
import { Lock, Download, ExternalLink } from "lucide-react";
import heroImage from "@/assets/hero-secure-share.jpg";

const Hero = () => {
  return (
    <section className="relative overflow-hidden pt-20 pb-16 md:pt-28 md:pb-24">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium">
              <Lock className="w-4 h-4" />
              <span>Zero-knowledge encryption</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              Share web pages —{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                privately, instantly.
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-xl leading-relaxed">
              Scrape. Sanitize. Encrypt — all in your browser. Only people with the secret link can read your content.
            </p>
            
            <div className="flex flex-wrap gap-4">
              <Button variant="hero" size="lg" className="group">
                <Download className="group-hover:scale-110 transition-transform" />
                Get the Extension
              </Button>
              <Button variant="outline" size="lg">
                <ExternalLink className="w-4 h-4" />
                Try Demo
              </Button>
            </div>

            <div className="flex items-center gap-6 pt-4">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary border-2 border-background"
                  />
                ))}
              </div>
              <div className="text-sm">
                <p className="font-semibold">Trusted by developers</p>
                <p className="text-muted-foreground">100% open source</p>
              </div>
            </div>
          </div>

          {/* Right Image */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-secondary/20 rounded-3xl blur-3xl" />
            <img
              src={heroImage}
              alt="Secure page sharing visualization"
              className="relative rounded-3xl shadow-2xl border border-border/50"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
