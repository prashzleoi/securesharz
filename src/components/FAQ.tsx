import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

const FAQ = () => {
  const faqs = [
    {
      question: "Can SecureShare read my content?",
      answer: "No — we store only ciphertext. The decryption key never leaves your device unless you include it in the link you share.",
    },
    {
      question: "Is the site free?",
      answer: "Basic hosting is free with limits. Self-hosting is free and recommended for sensitive use.",
    },
    {
      question: "What about images and attachments?",
      answer: "Images in the page are included by default; you can toggle images off before sharing.",
    },
    {
      question: "Is this legal?",
      answer: "Don't share content you don't have rights to. For some websites, scraping may violate terms of service — we show a warning and let users confirm.",
    },
    {
      question: "How long are links valid?",
      answer: "You can set custom expiry times or create one-time view links. By default, links remain active until you delete them.",
    },
    {
      question: "Can I use this for sensitive business data?",
      answer: "Yes! Many organizations use SecureShare with self-hosting for full control. We recommend self-hosting for highly sensitive data.",
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Frequently asked questions
            </h2>
            <p className="text-xl text-muted-foreground">
              Everything you need to know about SecureShare
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, idx) => (
              <AccordionItem
                key={idx}
                value={`item-${idx}`}
                className="bg-card rounded-2xl border border-border px-6 shadow-sm"
              >
                <AccordionTrigger className="text-left font-semibold text-lg hover:no-underline py-6">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-4">Still have questions?</p>
            <Button variant="outline" size="lg" asChild>
              <a href="mailto:peacefulboy2005@gmail.com">
                Contact Support
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
