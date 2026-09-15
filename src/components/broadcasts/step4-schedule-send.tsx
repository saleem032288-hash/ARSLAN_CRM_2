'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Send,
  Loader2,
  Users,
  Save,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BroadcastSendingMode } from '@/lib/whatsapp/sending-mode';

// Target throughput Super Safe mode is calibrated to. Kept in sync with
// `lib/whatsapp/super-safe-rate-limit.ts`; only used for the UI's
// "estimated time" hint.
const SUPER_SAFE_MESSAGES_PER_MINUTE = 8;

interface AudienceConfig {
  type: string;
  tagIds?: string[];
  csvContacts?: { phone: string; name?: string }[];
}

interface Step4Props {
  name: string;
  onNameChange: (name: string) => void;
  template: MessageTemplate;
  audience: AudienceConfig;
  mode: BroadcastSendingMode;
  onModeChange: (mode: BroadcastSendingMode) => void;
  onSend: () => void;
  onSaveDraft?: () => void;
  onBack: () => void;
  isProcessing: boolean;
  progress: number;
}

export function Step4ScheduleSend({
  name,
  onNameChange,
  template,
  audience,
  mode,
  onModeChange,
  onSend,
  onSaveDraft,
  onBack,
  isProcessing,
  progress,
}: Step4Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [showConfirm, setShowConfirm] = useState(false);
  const [estimatedReach, setEstimatedReach] = useState<number>(0);
  const [loadingReach, setLoadingReach] = useState(true);

  useEffect(() => {
    async function calculateReach() {
      setLoadingReach(true);
      try {
        const supabase = createClient();

        if (audience.type === 'all') {
          const { count } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true });
          setEstimatedReach(count ?? 0);
        } else if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
          const { data: contactTags } = await supabase
            .from('contact_tags')
            .select('contact_id')
            .in('tag_id', audience.tagIds);

          const uniqueIds = new Set((contactTags ?? []).map((ct) => ct.contact_id));
          setEstimatedReach(uniqueIds.size);
        } else if (audience.type === 'csv' && audience.csvContacts) {
          setEstimatedReach(audience.csvContacts.length);
        } else {
          setEstimatedReach(0);
        }
      } finally {
        setLoadingReach(false);
      }
    }

    calculateReach();
  }, [audience]);

  const audienceLabel =
    audience.type === 'all'
      ? t('scheduleSend.audienceAll')
      : audience.type === 'tags'
        ? t('scheduleSend.audienceTags')
        : audience.type === 'csv'
          ? t('scheduleSend.audienceCsv')
          : t('scheduleSend.audienceField');

  const modeLabel =
    mode === 'super_safe'
      ? t('scheduleSend.modeSuperSafe')
      : t('scheduleSend.modeInstant');

  // Super Safe runs at ~8 messages/minute. Rough wall-clock estimate
  // for the summary + confirm sheet, driven by the same constant the
  // server's token bucket uses.
  const estimatedMinutes =
    mode === 'super_safe' && estimatedReach > 0
      ? Math.max(1, Math.ceil(estimatedReach / SUPER_SAFE_MESSAGES_PER_MINUTE))
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('scheduleSend.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('scheduleSend.subtitle')}
        </p>
      </div>

      {/* Broadcast Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">{t('scheduleSend.broadcastName')}</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('scheduleSend.broadcastNamePlaceholder')}
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Sending Mode — the choice is NOT cosmetic: it is sent with every
          batch to /api/whatsapp/broadcast, where the server enforces the
          pace. Super Safe holds this account's outbound broadcast sends
          to ~8/min via a shared token bucket; Instant sends as fast as
          Meta's own limits allow. */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          {t('scheduleSend.sendingMode')}
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onModeChange('instant')}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
              mode === 'instant'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border-border bg-card/50 hover:border-border'
            }`}
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                mode === 'instant'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {t('scheduleSend.modeInstant')}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('scheduleSend.modeInstantDesc')}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onModeChange('super_safe')}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
              mode === 'super_safe'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border-border bg-card/50 hover:border-border'
            }`}
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                mode === 'super_safe'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {t('scheduleSend.modeSuperSafe')}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('scheduleSend.modeSuperSafeDesc')}
              </p>
            </div>
          </button>
        </div>

        {estimatedMinutes !== null && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('scheduleSend.estTime', { minutes: estimatedMinutes })}
          </p>
        )}
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">{t('scheduleSend.summary')}</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.template')}</p>
            <p className="text-foreground">{template.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.modeRow')}</p>
            <p className="text-foreground">{modeLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.audience')}</p>
            <p className="text-foreground">{audienceLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.estimatedReach')}</p>
            <div className="flex items-center gap-1.5">
              {loadingReach ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : (
                <>
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <p className="font-medium text-foreground">{estimatedReach.toLocaleString()}</p>
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.language')}</p>
            <p className="text-foreground">{template.language ?? 'en_US'}</p>
          </div>
        </div>

        {estimatedMinutes !== null && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">
              {t('scheduleSend.superSafeEstimate', { minutes: estimatedMinutes })}
            </span>
          </div>
        )}
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">{t('scheduleSend.sending')}</p>
            </div>
            <span className="text-xs font-medium text-primary">{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isProcessing}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>

        <div className="flex items-center gap-2">
          {onSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={!name.trim() || isProcessing}
              className="border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {t('scheduleSend.saveDraft')}
            </Button>
          )}

          <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogTrigger
            render={
              <Button
                disabled={!name.trim() || isProcessing}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              />
            }
          >
            <Send className="h-4 w-4" />
            {t('scheduleSend.sendNow')}
          </DialogTrigger>
          <DialogContent className="border-border bg-popover sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">{t('scheduleSend.confirmTitle')}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t.rich('scheduleSend.confirmDesc', {
                  count: estimatedReach,
                  template: template.name,
                  b: (chunks) => (
                    <span className="font-medium text-popover-foreground">{chunks}</span>
                  ),
                })}
              </DialogDescription>
              <p className="pt-1 text-muted-foreground">
                {mode === 'super_safe'
                  ? t('scheduleSend.confirmSuperSafe', { minutes: estimatedMinutes ?? 1 })
                  : t('scheduleSend.confirmInstant')}
              </p>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                className="border-border text-muted-foreground"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  setShowConfirm(false);
                  onSend();
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Send className="h-4 w-4" />
                {t('scheduleSend.sendNow')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </div>
  );
}