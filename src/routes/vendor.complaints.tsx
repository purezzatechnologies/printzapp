import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Download, FileText, Loader2 } from "lucide-react";
import {
  getComplaintEvidenceFn,
  getComplaintsFn,
  respondComplaintFn,
  uploadComplaintEvidenceFn,
} from "@/lib/backend";
import { getFriendlyError } from "@/lib/errors";

export const Route = createFileRoute("/vendor/complaints")({
  loader: async () => await getComplaintsFn(),
  component: VendorComplaints,
});

type Complaint = Awaited<ReturnType<typeof getComplaintsFn>>[number];

const tone: Record<string, "default" | "secondary" | "destructive"> = {
  open: "destructive",
  responded: "secondary",
  escalated: "default",
  resolved: "secondary",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function downloadEvidence(id: string, name: string) {
  const file = await getComplaintEvidenceFn({ data: { id } });
  const a = document.createElement("a");
  a.href = file.dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function VendorComplaints() {
  const initial = Route.useLoaderData() as Complaint[];
  const [items, setItems] = useState<Complaint[]>(initial);
  const [responding, setResponding] = useState<string | null>(null);
  const [viewingEvidence, setViewingEvidence] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const submit = async (id: string) => {
    if (!message.trim()) return;
    const result = await respondComplaintFn({
      data: { id, message: message.trim() },
    });
    if (result.success) {
      setItems((current) =>
        current.map((c) =>
          c.id === id
            ? {
                ...c,
                status: c.status === "open" ? "responded" : c.status,
                responses: [
                  ...c.responses,
                  {
                    author: "You",
                    message: message.trim(),
                    at: new Date().toISOString(),
                  },
                ],
              }
            : c,
        ),
      );
      setMessage("");
      setResponding(null);
    }
  };

  const handleEvidenceUpload = async (complaintId: string, file: File) => {
    setUploadError(null);
    setUploadingFor(complaintId);
    try {
      const dataUrl = await readAsDataUrl(file);
      const result = await uploadComplaintEvidenceFn({
        data: {
          complaintId,
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          dataUrl,
        },
      });
      if (!result.success || !result.evidence) {
        setUploadError(result.error ?? "Upload failed.");
        return;
      }
      setItems((current) =>
        current.map((c) =>
          c.id === complaintId
            ? { ...c, evidence: [...c.evidence, result.evidence!] }
            : c,
        ),
      );
      setViewingEvidence(complaintId);
    } catch (err) {
      setUploadError(getFriendlyError(err, "Upload failed."));
    } finally {
      setUploadingFor(null);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Complaint Management</h2>
      {uploadError && (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {uploadError}
        </Card>
      )}
      <div className="space-y-3">
        {items.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            No complaints. Keep up the great work!
          </Card>
        )}
        {items.map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{c.id}</span>
                  <Badge variant={tone[c.status]} className="capitalize">
                    {c.status}
                  </Badge>
                  {c.evidence.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {c.evidence.length} evidence file
                      {c.evidence.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 font-semibold">{c.issue}</div>
                <div className="text-xs text-muted-foreground">
                  Order {c.orderId} • {c.customerName}
                </div>
                {c.penalty > 0 && (
                  <div className="mt-1 text-xs text-destructive">
                    Penalty applied: ₹{c.penalty.toLocaleString()}
                  </div>
                )}
                {c.responses.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-lg bg-muted/40 p-3 text-xs">
                    {c.responses.map((r, i) => (
                      <li key={i}>
                        <span className="font-semibold">{r.author}:</span>{" "}
                        <span className="text-muted-foreground">{r.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={(el) => {
                    fileInputs.current[c.id] = el;
                  }}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleEvidenceUpload(c.id, file);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingFor === c.id}
                  onClick={() => fileInputs.current[c.id]?.click()}
                >
                  {uploadingFor === c.id ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    "Upload Evidence"
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={c.evidence.length === 0}
                  onClick={() =>
                    setViewingEvidence(viewingEvidence === c.id ? null : c.id)
                  }
                >
                  {viewingEvidence === c.id ? "Hide Evidence" : "View Evidence"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setResponding(responding === c.id ? null : c.id);
                    setMessage("");
                  }}
                >
                  {responding === c.id ? "Cancel" : "Respond"}
                </Button>
              </div>
            </div>

            {viewingEvidence === c.id && c.evidence.length > 0 && (
              <div className="mt-4 space-y-2 rounded-lg border border-dashed bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Evidence files
                </p>
                {c.evidence.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-3 rounded-md bg-card p-2"
                  >
                    <FileText className="h-4 w-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {ev.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatBytes(ev.size)} · uploaded by {ev.uploadedBy} ·{" "}
                        {new Date(ev.uploadedAt).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await downloadEvidence(ev.id, ev.name);
                        } catch (err) {
                          setUploadError(getFriendlyError(err, "Upload failed."));
                        }
                      }}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" /> Download
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {responding === c.id && (
              <div className="mt-4 space-y-2">
                <Label>Response</Label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Explain what happened and how you'll make it right."
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => submit(c.id)}>
                    Send response
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
