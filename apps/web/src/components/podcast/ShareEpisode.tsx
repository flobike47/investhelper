import { useState } from 'react';
import {
  Button,
  Input,
  Modal,
  Popconfirm,
  Space,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { CopyOutlined, LinkOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ShareInfo } from '@/services/api';
import { runtimeConfig } from '@/lib/runtimeConfig';

export function ShareEpisode({ episodeId }: { episodeId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const shareKey = ['share', episodeId];
  const shareQ = useQuery({
    queryKey: shareKey,
    queryFn: () => api.getEpisodeShare(episodeId),
    enabled: open,
    staleTime: 0,
  });

  const createMut = useMutation({
    mutationFn: () => api.shareEpisode(episodeId),
    onSuccess: (data) => {
      qc.setQueryData(shareKey, data);
      message.success('Lien de partage créé.');
    },
    onError: (e: Error) => message.error(e.message || 'Erreur création'),
  });

  const revokeMut = useMutation({
    mutationFn: () => api.revokeShare(episodeId),
    onSuccess: () => {
      qc.setQueryData(shareKey, null);
      message.success('Lien révoqué.');
    },
    onError: (e: Error) => message.error(e.message || 'Erreur révocation'),
  });

  const shareUrl = (share: ShareInfo) =>
    `${window.location.origin}${runtimeConfig.basePath}share/${share.token}`;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      message.success('Lien copié.');
    } catch {
      message.error('Copie impossible — sélectionne et copie à la main.');
    }
  };

  return (
    <>
      <Tooltip title="Partager">
        <Button
          type="text"
          icon={<ShareAltOutlined />}
          onClick={() => setOpen(true)}
        />
      </Tooltip>

      <Modal
        title="Partager cet épisode"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Un lien non listé : n'importe qui qui l'a peut écouter, sans avoir
            besoin de compte. Tu peux le révoquer quand tu veux.
          </Typography.Text>

          {shareQ.isLoading && <Typography.Text>Chargement…</Typography.Text>}

          {!shareQ.isLoading && shareQ.data && (
            <>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  prefix={<LinkOutlined />}
                  value={shareUrl(shareQ.data)}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="primary"
                  icon={<CopyOutlined />}
                  onClick={() => copy(shareUrl(shareQ.data!))}
                >
                  Copier
                </Button>
              </Space.Compact>
              <Popconfirm
                title="Révoquer ce lien ?"
                description="Le lien actuel ne fonctionnera plus."
                onConfirm={() => revokeMut.mutate()}
                okText="Révoquer"
                cancelText="Annuler"
              >
                <Button danger loading={revokeMut.isPending}>
                  Révoquer
                </Button>
              </Popconfirm>
            </>
          )}

          {!shareQ.isLoading && !shareQ.data && (
            <Button
              type="primary"
              icon={<ShareAltOutlined />}
              loading={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Créer un lien de partage
            </Button>
          )}
        </Space>
      </Modal>
    </>
  );
}
