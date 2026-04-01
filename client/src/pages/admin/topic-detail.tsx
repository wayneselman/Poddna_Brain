import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  Save,
  Loader2,
  Tags,
  MessageSquare,
  Podcast,
  Clock,
  ExternalLink,
  Star,
} from "lucide-react";

interface TopicStatement {
  statementId: string;
  episodeId: string;
  episodeTitle: string;
  startTime: number;
  text: string;
  isPrimary: boolean;
  confidence: number;
}

interface Topic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TopicDetailResponse {
  topic: Topic;
  statements: TopicStatement[];
}

const editFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional().nullable(),
});

type EditFormValues = z.infer<typeof editFormSchema>;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function AdminTopicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  const { data, isLoading } = useQuery<TopicDetailResponse>({
    queryKey: ["/api/admin/topics", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/topics/${id}`);
      if (!res.ok) throw new Error("Failed to fetch topic");
      return res.json();
    },
    enabled: !!id,
  });

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: EditFormValues) => {
      const res = await apiRequest("PATCH", `/api/admin/topics/${id}`, values);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Topic Updated", description: "Changes saved successfully" });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/topics", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/topics"] });
    },
    onError: () => {
      toast({ title: "Update Failed", description: "Failed to save changes", variant: "destructive" });
    },
  });

  const handleStartEdit = () => {
    if (data?.topic) {
      form.reset({
        name: data.topic.name,
        description: data.topic.description ?? "",
      });
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    form.reset();
  };

  const onSubmit = (values: EditFormValues) => {
    updateMutation.mutate(values);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <Tags className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-lg font-medium">Topic not found</p>
        <Link href="/admin/topics">
          <Button variant="ghost">Back to Topics</Button>
        </Link>
      </div>
    );
  }

  const { topic, statements } = data;

  const episodeGroups = statements.reduce<Record<string, TopicStatement[]>>((acc, stmt) => {
    if (!acc[stmt.episodeId]) acc[stmt.episodeId] = [];
    acc[stmt.episodeId].push(stmt);
    return acc;
  }, {});

  const episodeList = Object.entries(episodeGroups).map(([episodeId, stmts]) => ({
    episodeId,
    episodeTitle: stmts[0].episodeTitle,
    statements: stmts.sort((a, b) => a.startTime - b.startTime),
  }));

  const primaryCount = statements.filter(s => s.isPrimary).length;
  const uniqueEpisodes = new Set(statements.map(s => s.episodeId)).size;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/topics">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" data-testid="text-topic-name">{topic.name}</h1>
          <p className="text-muted-foreground">Topic ID: {topic.id}</p>
        </div>
        {!isEditing && (
          <Button onClick={handleStartEdit} data-testid="button-edit">
            Edit Topic
          </Button>
        )}
      </div>

      {isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit Topic</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          value={field.value ?? ""} 
                          rows={3}
                          data-testid="input-description" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save">
                    {updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCancelEdit} data-testid="button-cancel">
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5" />
              Topic Details
            </CardTitle>
            {topic.description && (
              <CardDescription className="text-base">
                {topic.description}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Badge variant="secondary" className="gap-1 text-sm py-1 px-3">
                <MessageSquare className="h-4 w-4" />
                {statements.length} statements
              </Badge>
              <Badge variant="secondary" className="gap-1 text-sm py-1 px-3">
                <Star className="h-4 w-4" />
                {primaryCount} primary
              </Badge>
              <Badge variant="outline" className="gap-1 text-sm py-1 px-3">
                <Podcast className="h-4 w-4" />
                {uniqueEpisodes} episodes
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Linked Statements</CardTitle>
          <CardDescription>
            Statements grouped by episode, sorted by timestamp
          </CardDescription>
        </CardHeader>
        <CardContent>
          {episodeList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No statements linked to this topic yet</p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {episodeList.map(({ episodeId, episodeTitle, statements: stmts }) => (
                <AccordionItem key={episodeId} value={episodeId}>
                  <AccordionTrigger className="hover:no-underline" data-testid={`accordion-episode-${episodeId}`}>
                    <div className="flex items-center gap-3 text-left">
                      <Podcast className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium line-clamp-1">{episodeTitle}</span>
                      <Badge variant="secondary" className="ml-auto">
                        {stmts.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pl-7">
                      {stmts.map((stmt) => (
                        <div 
                          key={stmt.statementId} 
                          className="border rounded-lg p-3 bg-muted/30"
                          data-testid={`statement-${stmt.statementId}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatTime(stmt.startTime)}
                            </div>
                            <div className="flex items-center gap-1">
                              {stmt.isPrimary && (
                                <Badge variant="default" className="text-xs">Primary</Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {Math.round(stmt.confidence * 100)}%
                              </Badge>
                            </div>
                          </div>
                          <p className="text-sm">{stmt.text}</p>
                          <div className="mt-2">
                            <Link href={`/episode/${episodeId}`}>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" data-testid={`button-goto-episode-${stmt.statementId}`}>
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Go to Episode
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
