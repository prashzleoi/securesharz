import { MousePointerClick, Sparkles, Link2 } from "lucide-react";

const HowItWorks = () => {
  const steps = [
    {
      icon: MousePointerClick,
      title: "Click",
      description: "Hit Share in the extension.",
      color: "from-primary to-primary-glow",
    },
    {
      icon: Sparkles,
      title: "Clean",
      description: "Scripts and trackers are stripped out.",
      color: "from-accent to-accent/80",
    },
    {
      icon: Link2,
      title: "Lock",
      description: "We encrypt content in your browser and upload ciphertext. You get a secret link.",
      color: "from-secondary to-secondary/80",
    },
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            How it works
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Three simple steps to secure sharing
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={idx}
                className="relative group"
              >
                {/* Connection Line */}
                {idx < steps.length - 1 && (
                  <div className="hidden md:block absolute top-20 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-border to-transparent" />
                )}

                <div className="bg-card rounded-2xl p-8 border border-border shadow-sm hover:shadow-lg transition-all hover:-translate-y-1">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-6`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-4xl font-bold text-muted-foreground/30">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-2xl font-bold">{step.title}</h3>
                  </div>
                  
                  <p className="text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            The entire process takes less than a second ⚡
          </p>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
