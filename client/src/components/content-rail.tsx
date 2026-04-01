import { ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

interface ContentRailProps {
  title: string;
  viewAllHref?: string;
  children: ReactNode;
  testId?: string;
}

export default function ContentRail({ title, viewAllHref, children, testId }: ContentRailProps) {
  return (
    <section className="py-4" data-testid={testId || "content-rail"}>
      <div className="container mx-auto px-6">
        {/* Rail header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl md:text-3xl font-bold" data-testid={`${testId}-title`}>
            {title}
          </h2>
          {viewAllHref && (
            <Link href={viewAllHref}>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                data-testid={`${testId}-view-all`}
              >
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>

        {/* Horizontal scroll container */}
        <div className="relative -mx-6 px-6">
          <div 
            className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory pb-4"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
            data-testid={`${testId}-scroll-container`}
          >
            {children}
          </div>
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
}
