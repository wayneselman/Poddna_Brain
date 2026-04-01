import { useState } from "react";
import { Helmet } from "react-helmet";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, ArrowRight } from "lucide-react";

const demoFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  company: z.string().min(2, "Company name is required"),
  role: z.string().min(2, "Your role is required"),
  companySize: z.string().min(1, "Please select company size"),
  useCase: z.string().min(1, "Please select a use case"),
  notes: z.string().optional(),
});

type DemoFormValues = z.infer<typeof demoFormSchema>;

const companySizes = [
  { value: "1-10", label: "1-10 employees" },
  { value: "11-50", label: "11-50 employees" },
  { value: "51-200", label: "51-200 employees" },
  { value: "201-1000", label: "201-1000 employees" },
  { value: "1000+", label: "1000+ employees" },
];

const useCases = [
  { value: "podcast-network", label: "Podcast Network / Studio" },
  { value: "brand-agency", label: "Brand / Agency" },
  { value: "media-ip", label: "Media / IP Team" },
  { value: "research", label: "Research / Journalism" },
  { value: "compliance", label: "Compliance / Legal" },
  { value: "other", label: "Other" },
];

export default function RequestDemoPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<DemoFormValues>({
    resolver: zodResolver(demoFormSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      role: "",
      companySize: "",
      useCase: "",
      notes: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: DemoFormValues) => {
      return apiRequest("POST", "/api/demo-leads", data);
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: DemoFormValues) => {
    submitMutation.mutate(data);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-white dark:bg-background flex items-center justify-center">
        <div className="max-w-md mx-auto px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-4" data-testid="text-success-title">
            Thank You!
          </h1>
          <p className="text-gray-600 dark:text-muted-foreground mb-8">
            We've received your demo request. A member of our team will reach out within 24 hours to schedule a personalized demo.
          </p>
          <Button variant="outline" onClick={() => window.location.href = "/"} data-testid="button-back-home">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <Helmet>
        <title>Request Demo - PodDNA | Podcast Intelligence Platform</title>
        <meta name="description" content="Schedule a personalized demo of PodDNA's podcast intelligence platform. See how AI-powered analysis can transform your content strategy." />
      </Helmet>
      
      <section className="py-16 lg:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Left: Info */}
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-foreground mb-4" data-testid="text-demo-title">
                Request a Demo
              </h1>
              <p className="text-lg text-gray-600 dark:text-muted-foreground mb-8">
                See how PodDNA can transform podcast content into actionable intelligence for your organization.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-foreground">Personalized Walkthrough</h3>
                    <p className="text-gray-600 dark:text-muted-foreground text-sm">
                      See the platform configured for your specific use case and industry.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-foreground">Live Analysis</h3>
                    <p className="text-gray-600 dark:text-muted-foreground text-sm">
                      We'll analyze podcasts relevant to your business during the demo.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-foreground">Pricing Discussion</h3>
                    <p className="text-gray-600 dark:text-muted-foreground text-sm">
                      Get pricing tailored to your volume and feature requirements.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Form */}
            <Card className="p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Smith" {...field} data-testid="input-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Work Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="jane@company.com" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corp" {...field} data-testid="input-company" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Role</FormLabel>
                        <FormControl>
                          <Input placeholder="VP of Content" {...field} data-testid="input-role" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companySize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Size</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-company-size">
                              <SelectValue placeholder="Select company size" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {companySizes.map((size) => (
                              <SelectItem key={size.value} value={size.value}>
                                {size.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="useCase"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Use Case</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-use-case">
                              <SelectValue placeholder="Select use case" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {useCases.map((uc) => (
                              <SelectItem key={uc.value} value={uc.value}>
                                {uc.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Tell us about your specific needs or questions..."
                            className="min-h-[80px]"
                            {...field}
                            data-testid="input-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full gap-2" 
                    size="lg"
                    disabled={submitMutation.isPending}
                    data-testid="button-submit-demo"
                  >
                    {submitMutation.isPending ? "Submitting..." : "Request Demo"}
                    {!submitMutation.isPending && <ArrowRight className="w-4 h-4" />}
                  </Button>
                </form>
              </Form>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
