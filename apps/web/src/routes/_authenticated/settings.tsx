import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Brain, Check, Plus, X } from "lucide-react";
import { useState } from "react";

import { CHANNEL_LABELS, type Channel, memory as initialMemory } from "@/features/dashboard/mock";
import { PageHeader } from "@/features/dashboard/ui";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="flowy-page">
      <PageHeader title="Settings" subtitle="Channels, what Flowy remembers, billing, and your account." />

      <Tabs defaultValue="memory">
        <TabsList className="mb-6">
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="memory">
          <MemoryTab />
        </TabsContent>
        <TabsContent value="channels">
          <ChannelsTab />
        </TabsContent>
        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>
        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MemoryTab() {
  const [mem, setMem] = useState(initialMemory);

  const update = (section: string, idx: number, value: string) =>
    setMem((m) =>
      m.map((s) =>
        s.title === section
          ? { ...s, items: s.items.map((it, i) => (i === idx ? { ...it, value } : it)) }
          : s,
      ),
    );
  const remove = (section: string, idx: number) =>
    setMem((m) =>
      m.map((s) => (s.title === section ? { ...s, items: s.items.filter((_, i) => i !== idx) } : s)),
    );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-[#bcd6f2] bg-[#eef4fd] p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#5aa6ff] to-[#1566e6] text-white">
          <Brain className="size-5" />
        </span>
        <div>
          <p className="font-semibold">This is everything Flowy remembers about you.</p>
          <p className="text-muted-foreground text-sm">
            It uses this to do your work the way you'd want. You're in control — edit or remove anything,
            anytime.
          </p>
        </div>
      </div>

      {mem.map((section) => (
        <Card key={section.title}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{section.title}</CardTitle>
            <Button size="sm" variant="ghost" className="text-muted-foreground">
              <Plus className="size-4" /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {section.items.map((it, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-muted-foreground w-36 shrink-0 text-sm">{it.label}</span>
                <Input
                  value={it.value}
                  onChange={(e) => update(section.title, i, e.target.value)}
                  className="h-9"
                />
                <button
                  type="button"
                  onClick={() => remove(section.title, i)}
                  className="text-muted-foreground hover:text-destructive grid size-8 shrink-0 place-items-center rounded-lg transition"
                  aria-label="Forget this"
                  title="Forget this"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChannelsTab() {
  const channels: { key: Channel; connected: boolean; detail: string }[] = [
    { key: "discord", connected: true, detail: "#results · Acme HQ" },
    { key: "telegram", connected: true, detail: "@acme_ops" },
    { key: "slack", connected: true, detail: "Acme HQ workspace" },
    { key: "whatsapp", connected: true, detail: "+1 (415) •••• 22" },
    { key: "email", connected: true, detail: "founder@acme.com" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Delivery channels</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {channels.map((c, i) => (
          <div key={c.key} className={`flex items-center justify-between py-3 ${i > 0 ? "border-t" : ""}`}>
            <div>
              <div className="text-sm font-medium">{CHANNEL_LABELS[c.key]}</div>
              <div className="text-muted-foreground text-xs">{c.detail}</div>
            </div>
            {c.connected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <Check className="size-3" /> Connected
              </span>
            ) : (
              <Button size="sm" variant="outline">
                Connect
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function BillingTab() {
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <div className="text-muted-foreground text-sm">Current plan</div>
            <div className="mt-0.5 text-2xl font-bold">Pro</div>
            <div className="text-muted-foreground text-sm">$49 / month · renews May 26</div>
          </div>
          <Button variant="outline">Manage plan</Button>
        </CardContent>
      </Card>
      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold">1,284</div>
            <p className="text-muted-foreground text-sm">agent runs · of 5,000 included</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment method</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Visa ending •••• 4242</p>
            <Button variant="outline" size="sm" className="mt-3">
              Update card
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AccountTab() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name" value="Sebastian" />
          <Field label="Email" value="founder@acme.com" />
          <Button size="sm">Save changes</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-rose-600">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">Permanently delete your account and all agents.</p>
          <Button variant="outline" size="sm" className="border-rose-200 text-rose-600 hover:bg-rose-50">
            Delete account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      <Input defaultValue={value} className="max-w-sm" />
    </div>
  );
}
