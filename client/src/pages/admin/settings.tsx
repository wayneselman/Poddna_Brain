import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FeatureFlag } from "@shared/schema";
import { Loader2, Settings, Save, Plus, Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const KNOWN_FLAGS = [
  {
    key: "PUBLIC_FULL_TRANSCRIPTS_ENABLED",
    label: "Show Full Transcripts",
    description: "When enabled, users can see full podcast transcripts. When disabled, only ~250 character snippets around annotations are shown (snippet-first mode for legal compliance).",
    type: "boolean" as const,
    default: "false",
  },
  {
    key: "MAX_ANNOTATION_CHARS",
    label: "Max Annotation Length",
    description: "Maximum number of characters allowed in user annotations.",
    type: "number" as const,
    default: "300",
  },
  {
    key: "MAX_SNIPPET_CHARS",
    label: "Max Snippet Length",
    description: "Maximum number of characters shown in transcript snippets around annotations.",
    type: "number" as const,
    default: "250",
  },
];

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [newFlagKey, setNewFlagKey] = useState("");
  const [newFlagValue, setNewFlagValue] = useState("");
  const [newFlagDescription, setNewFlagDescription] = useState("");
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});

  const { data: flags = [], isLoading } = useQuery<FeatureFlag[]>({
    queryKey: ["/api/admin/feature-flags"],
  });

  const updateFlagMutation = useMutation({
    mutationFn: async ({ key, value, description }: { key: string; value: string; description?: string }) => {
      return apiRequest("PUT", `/api/admin/feature-flags/${encodeURIComponent(key)}`, { value, description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags"] });
      toast({
        title: "Setting Updated",
        description: "The feature flag has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteFlagMutation = useMutation({
    mutationFn: async (key: string) => {
      return apiRequest("DELETE", `/api/admin/feature-flags/${encodeURIComponent(key)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags"] });
      toast({
        title: "Setting Deleted",
        description: "The feature flag has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createFlagMutation = useMutation({
    mutationFn: async ({ key, value, description }: { key: string; value: string; description?: string }) => {
      return apiRequest("PUT", `/api/admin/feature-flags/${encodeURIComponent(key)}`, { value, description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags"] });
      setNewFlagKey("");
      setNewFlagValue("");
      setNewFlagDescription("");
      toast({
        title: "Setting Created",
        description: "The new feature flag has been created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Create Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getFlagValue = (key: string): string => {
    const flag = flags.find(f => f.key === key);
    return flag?.value ?? "";
  };

  const getEditingValue = (key: string, defaultValue: string): string => {
    if (editingValues[key] !== undefined) {
      return editingValues[key];
    }
    const flagValue = getFlagValue(key);
    return flagValue || defaultValue;
  };

  const handleBooleanToggle = (key: string, currentValue: string, description?: string) => {
    const newValue = currentValue === "true" ? "false" : "true";
    updateFlagMutation.mutate({ key, value: newValue, description });
  };

  const handleNumberSave = (key: string, description?: string) => {
    const value = editingValues[key];
    if (value) {
      updateFlagMutation.mutate({ key, value, description });
      setEditingValues(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const getKnownFlagInfo = (key: string) => {
    return KNOWN_FLAGS.find(f => f.key === key);
  };

  const knownFlagKeys = KNOWN_FLAGS.map(f => f.key);
  const customFlags = flags.filter(f => !knownFlagKeys.includes(f.key));

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-settings-title">
          <Settings className="h-8 w-8" />
          Platform Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure feature flags and platform behavior
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Snippet-First Architecture</CardTitle>
          <CardDescription>
            Control how transcripts are displayed to users for legal compliance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {KNOWN_FLAGS.map((knownFlag) => {
            const currentValue = getEditingValue(knownFlag.key, knownFlag.default);
            const flagExists = flags.some(f => f.key === knownFlag.key);
            
            return (
              <div key={knownFlag.key} className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-base font-medium">{knownFlag.label}</Label>
                      {flagExists ? (
                        <Badge variant="outline" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Using default
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {knownFlag.description}
                    </p>
                    <code className="text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded mt-1 inline-block">
                      {knownFlag.key}
                    </code>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {knownFlag.type === "boolean" ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={currentValue === "true"}
                          onCheckedChange={() => handleBooleanToggle(knownFlag.key, currentValue, knownFlag.description)}
                          disabled={updateFlagMutation.isPending}
                          data-testid={`switch-${knownFlag.key}`}
                        />
                        <span className="text-sm w-8">
                          {currentValue === "true" ? "On" : "Off"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={editingValues[knownFlag.key] ?? (getFlagValue(knownFlag.key) || knownFlag.default)}
                          onChange={(e) => setEditingValues(prev => ({ ...prev, [knownFlag.key]: e.target.value }))}
                          className="w-24"
                          data-testid={`input-${knownFlag.key}`}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleNumberSave(knownFlag.key, knownFlag.description)}
                          disabled={!editingValues[knownFlag.key] || updateFlagMutation.isPending}
                          data-testid={`button-save-${knownFlag.key}`}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <Separator />
              </div>
            );
          })}

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-900 dark:text-amber-100">
                  Legal Compliance Note
                </h4>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  The snippet-first architecture (PUBLIC_FULL_TRANSCRIPTS_ENABLED=false) is recommended for 
                  legal compliance when displaying podcast content. This shows only ~250 character snippets 
                  around annotations rather than full transcripts.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {customFlags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Custom Feature Flags</CardTitle>
            <CardDescription>
              Additional configuration options
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {customFlags.map((flag) => (
                <div key={flag.id} className="flex items-center justify-between gap-4 p-4 border rounded-lg">
                  <div className="flex-1">
                    <code className="font-medium text-sm">{flag.key}</code>
                    {flag.description && (
                      <p className="text-sm text-muted-foreground mt-1">{flag.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline">{flag.value}</Badge>
                      {flag.updatedAt && (
                        <span className="text-xs text-muted-foreground">
                          Updated {new Date(flag.updatedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-delete-${flag.key}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Feature Flag</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete the "{flag.key}" feature flag? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid={`button-cancel-delete-${flag.key}`}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteFlagMutation.mutate(flag.key)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid={`button-confirm-delete-${flag.key}`}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Custom Flag
          </CardTitle>
          <CardDescription>
            Create a new feature flag for custom configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="new-flag-key">Flag Key</Label>
              <Input
                id="new-flag-key"
                placeholder="e.g., ENABLE_NEW_FEATURE"
                value={newFlagKey}
                onChange={(e) => setNewFlagKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                data-testid="input-new-flag-key"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-flag-value">Value</Label>
              <Input
                id="new-flag-value"
                placeholder="e.g., true, false, or a number"
                value={newFlagValue}
                onChange={(e) => setNewFlagValue(e.target.value)}
                data-testid="input-new-flag-value"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-flag-description">Description (optional)</Label>
              <Textarea
                id="new-flag-description"
                placeholder="Describe what this flag controls..."
                value={newFlagDescription}
                onChange={(e) => setNewFlagDescription(e.target.value)}
                rows={2}
                data-testid="input-new-flag-description"
              />
            </div>
            <Button
              onClick={() => createFlagMutation.mutate({
                key: newFlagKey,
                value: newFlagValue,
                description: newFlagDescription || undefined,
              })}
              disabled={!newFlagKey || !newFlagValue || createFlagMutation.isPending}
              className="w-full"
              data-testid="button-create-flag"
            >
              {createFlagMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Feature Flag
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
