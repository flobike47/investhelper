import type { ReactNode } from 'react';
import { Alert, App as AntApp, Avatar, Button, Progress, Segmented, Skeleton, Switch, TimePicker, theme } from 'antd';
import { BellOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '@/lib/auth';
import { useUserSettings } from '@/hooks/useUserSettings';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { usePodcastCategories } from '@/hooks/usePodcast';
import { useQuotas } from '@/hooks/useQuotas';
import { useIsMobile } from '@/hooks/useIsMobile';
import { HORIZON_LIST, type Horizon } from '@/constants/horizons';
import type { PodcastDuration, QuotaInfo, UserSettings } from '@/services/api';
import { PageHeader } from '@/components/common/PageHeader';

const QUOTA_LABELS: Record<QuotaInfo['bucket'], string> = {
  sentiment: 'Analyses de sentiment',
  themes: "Thèmes d'actualité",
  podcastScript: 'Épisodes de podcast',
  podcastTts: 'Synthèse vocale HD',
};

function Group({ label, children }: { label: string; children: ReactNode }) {
  const { token } = theme.useToken();
  return (
    <section aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ margin: '0 4px', fontSize: 13, fontWeight: 600, color: token.colorTextSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </h2>
      <div style={{ background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 16, overflow: 'hidden' }}>
        {children}
      </div>
    </section>
  );
}

function Row({ title, hint, children, first }: { title: string; hint?: string; children: ReactNode; first?: boolean }) {
  const { token } = theme.useToken();
  const id = `pref-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div role="group" aria-labelledby={id} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: first ? undefined : `1px solid ${token.colorBorderSecondary}` }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span id={id} style={{ fontSize: 15, fontWeight: 600 }}>
          {title}
        </span>
        {hint && <span style={{ fontSize: 13, color: token.colorTextSecondary, lineHeight: 1.35 }}>{hint}</span>}
      </span>
      {children}
    </div>
  );
}

/** HH:MM → dayjs du jour (sans plugin de parsing). */
function timeValue(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return dayjs().hour(h).minute(m).second(0);
}

/**
 * Rappel quotidien du podcast. L'option est par compte, l'abonnement par
 * appareil : on signale l'appareil qui ne recevra rien, et les cas où le
 * navigateur ne peut pas (iPhone hors app installée, permission refusée).
 */
function PodcastReminder() {
  const push = usePushNotifications();
  const { categories } = usePodcastCategories();
  const { message } = AntApp.useApp();
  const { token } = theme.useToken();

  const fail = (e: Error) => message.error(e.message || "Échec de l'enregistrement.");

  const onToggle = (on: boolean) =>
    (on ? push.enable() : push.disable()).then(
      () => message.success({ content: on ? 'Rappel activé' : 'Rappel désactivé', duration: 1.2 }),
      fail,
    );

  const onTest = () =>
    push.sendTest().then(
      ({ sent }) =>
        sent > 0
          ? message.success('Notification envoyée.')
          : message.warning("Aucun appareil n'a pu être joint : réactive le rappel sur cet appareil."),
      fail,
    );

  const canEnable = push.support === 'supported' && push.permission !== 'denied';

  return (
    <Row first title="Rappel du podcast" hint="Chaque jour à l'heure choisie, ton épisode est préparé et une notification te prévient.">
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 15 }}>
        <span>Notification quotidienne</span>
        <Switch
          aria-label="Rappel quotidien du podcast"
          checked={push.enabled}
          loading={push.busy}
          // Désactiver reste toujours possible, même depuis un appareil sans push
          disabled={!push.enabled && !canEnable}
          onChange={onToggle}
        />
      </label>

      {push.support === 'needs-install' && (
        <Alert
          type="info"
          showIcon
          message="Sur iPhone, installe d'abord l'app"
          description="Partager → « Sur l'écran d'accueil », puis ouvre InvestHelper depuis son icône pour activer le rappel."
        />
      )}
      {push.support === 'unsupported' && (
        <Alert type="info" showIcon message="Ce navigateur ne gère pas les notifications." />
      )}
      {push.support === 'supported' && push.permission === 'denied' && (
        <Alert
          type="warning"
          showIcon
          message="Notifications bloquées"
          description="Autorise-les pour InvestHelper dans les réglages de l'appareil (iPhone : Réglages → Notifications → InvestHelper)."
        />
      )}

      {push.enabled && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 15 }}>
            <span>Heure d'envoi</span>
            <TimePicker
              aria-label="Heure d'envoi du rappel"
              format="HH:mm"
              minuteStep={15}
              showNow={false}
              needConfirm={false}
              allowClear={false}
              inputReadOnly
              value={timeValue(push.time)}
              onChange={(v) =>
                v && push.setTime(v.format('HH:mm')).then(() => message.success({ content: 'Enregistré', duration: 1.2 }), fail)
              }
              style={{ width: 110 }}
            />
          </label>
          {categories.length === 0 && (
            <Alert type="warning" showIcon message="Ajoute des thèmes dans Podcast : sans thème, aucun épisode n'est préparé." />
          )}
          {push.support === 'supported' && push.deviceSubscribed === false && push.permission !== 'denied' && (
            <Alert
              type="info"
              showIcon
              message="Cet appareil ne reçoit pas le rappel."
              action={
                <Button size="small" loading={push.busy} onClick={() => onToggle(true)}>
                  Activer ici
                </Button>
              }
            />
          )}
          <Button icon={<BellOutlined />} onClick={onTest} style={{ alignSelf: 'flex-start' }}>
            Envoyer un test
          </Button>
          <span style={{ fontSize: 12, color: token.colorTextTertiary }}>Heure de cet appareil, tous les jours.</span>
        </>
      )}
    </Row>
  );
}

/**
 * Compte et réglages. Chaque choix est enregistré immédiatement et seul le
 * champ modifié est envoyé : aucune valeur affichée par défaut ne peut écraser
 * une préférence serveur.
 */
export default function Settings() {
  const { user, signOut } = useAuth();
  const settings = useUserSettings();
  const quotas = useQuotas();
  const isMobile = useIsMobile();
  const { message, modal } = AntApp.useApp();
  const { token } = theme.useToken();

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Compte';

  const save = (patch: Partial<UserSettings>) =>
    settings.save(patch).then(
      () => message.success({ content: 'Enregistré', duration: 1.2 }),
      (e: Error) => message.error(e.message || "Échec de l'enregistrement."),
    );

  const confirmSignOut = () =>
    modal.confirm({
      title: 'Se déconnecter ?',
      okText: 'Se déconnecter',
      okButtonProps: { danger: true },
      cancelText: 'Annuler',
      onOk: () => signOut(),
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 }}>
      <PageHeader title="Compte et réglages" showAccount={false} back={isMobile ? { to: '/', label: 'Retour' } : undefined} />

      <section aria-label="Compte" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 16 }}>
        <Avatar size={56} src={avatarUrl} alt="" icon={<UserOutlined />} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 17, fontWeight: 650 }}>{fullName}</span>
          {user?.email && fullName !== user.email && (
            <span style={{ fontSize: 13, color: token.colorTextSecondary, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</span>
          )}
          <span style={{ fontSize: 12, color: token.colorTextTertiary }}>Connecté avec Google · préférences synchronisées</span>
        </span>
      </section>

      <Group label="Préférences">
        {settings.error && (
          <Alert banner type="warning" message={`Réglages non chargés : ${settings.error.message}`} />
        )}
        {settings.loading ? (
          <div style={{ padding: 16 }}>
            <Skeleton active paragraph={{ rows: 4 }} />
          </div>
        ) : (
          <>
            <Row first title="Horizon par défaut" hint="Règle les indicateurs (moyennes, RSI) et la durée des plans.">
              <Segmented<Horizon>
                block
                name="horizon"
                value={settings.horizon}
                onChange={(horizon) => save({ horizon })}
                options={HORIZON_LIST.map((h) => ({ label: h.label.replace(' terme', ''), value: h.id }))}
              />
            </Row>
            <Row title="Apparence" hint="Sombre ou clair, sur tous vos appareils.">
              <Segmented<'dark' | 'light'>
                block
                name="theme"
                value={settings.theme}
                onChange={(theme) => save({ theme })}
                options={[
                  { label: 'Sombre', value: 'dark' },
                  { label: 'Clair', value: 'light' },
                ]}
              />
            </Row>
            <Row title="Durée du podcast" hint="Auto : adaptée au volume d'actualités du jour.">
              <Segmented<PodcastDuration>
                block
                name="podcastDuration"
                value={settings.podcastDuration}
                onChange={(podcastDuration) => save({ podcastDuration })}
                options={[
                  { label: 'Auto', value: 'auto' },
                  { label: '2 min', value: '2' },
                  { label: '4 min', value: '4' },
                  { label: '8 min', value: '8' },
                ]}
              />
            </Row>
          </>
        )}
      </Group>

      {!settings.loading && !settings.error && (
        <Group label="Notifications">
          <PodcastReminder />
        </Group>
      )}

      <Group label="Utilisation aujourd'hui">
        {quotas.isLoading ? (
          <div style={{ padding: 16 }}>
            <Skeleton active paragraph={{ rows: 3 }} />
          </div>
        ) : quotas.error ? (
          <Alert banner type="error" message={`Quotas indisponibles : ${quotas.error.message}`} />
        ) : (
          (quotas.data ?? []).map((q, i) => {
            const ratio = q.limit > 0 ? q.used / q.limit : 0;
            return (
              <div key={q.bucket} style={{ padding: '12px 16px', borderTop: i === 0 ? undefined : `1px solid ${token.colorBorderSecondary}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 15 }}>
                  <span>{QUOTA_LABELS[q.bucket] ?? q.bucket}</span>
                  <span className="tabular-nums" style={{ color: token.colorTextSecondary }}>
                    {q.used} / {q.limit}
                  </span>
                </div>
                <Progress
                  percent={Math.round(ratio * 100)}
                  showInfo={false}
                  size="small"
                  strokeColor={ratio > 0.8 ? token.colorWarning : token.colorPrimary}
                  aria-label={`${QUOTA_LABELS[q.bucket] ?? q.bucket} : ${q.used} sur ${q.limit}`}
                  style={{ margin: 0 }}
                />
                <span className="tabular-nums" style={{ fontSize: 12, color: token.colorTextTertiary }}>
                  Remise à zéro dans {Math.ceil(q.resetSec / 3600)} h
                </span>
              </div>
            );
          })
        )}
      </Group>

      <Button size="large" danger icon={<LogoutOutlined />} onClick={confirmSignOut}>
        Se déconnecter
      </Button>
      <p style={{ margin: 0, fontSize: 12, color: token.colorTextTertiary, textAlign: 'center', lineHeight: 1.5 }}>
        InvestHelper ne stocke aucune donnée bancaire.
        <br />
        Indicateurs, pas des conseils financiers.
      </p>
    </div>
  );
}
