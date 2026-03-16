import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="glass-panel p-12 rounded-3xl max-w-md text-center flex flex-col items-center">
        <AlertCircle className="w-16 h-16 text-destructive mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-4">Page Not Found</h1>
        <p className="text-muted-foreground mb-8">
          The requested route does not exist in this terminal.
        </p>
        <Link 
          href="/" 
          className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
