import { useConfig, useEditorPanelConfig, useElementData } from '@sigmacomputing/plugin';
import { CONFIG_OPTIONS } from '../sigma/editorPanel.js';

const isIframed = typeof window !== 'undefined' && window.parent !== window;

function readEmbedIdentity() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  // Sigma Embed can append these via a formula URL, e.g.
  // https://…/?playerId={{CurrentUserEmail()}}&displayName={{CurrentUserFullName()}}
  const playerId = (params.get('playerId') || params.get('email') || '').trim();
  if (!playerId) return null;
  const displayName = (params.get('displayName') || params.get('name') || playerId).trim();
  return { playerId, displayName };
}

// Identity seam for the shared wallet API:
// 1) URL ?playerId= (Sigma Embed / deep link)
// 2) Sigma plugin editor bindings (CurrentUserEmail)
// 3) Local standalone name picker
export function useViewerIdentity(localPlayerId) {
  useEditorPanelConfig(CONFIG_OPTIONS);
  const config = useConfig();
  const viewerData = useElementData(config.viewerSource);
  const sigmaPlayerId = viewerData[config.viewerEmailCol]?.[0] || null;
  const sigmaDisplayName = viewerData[config.viewerNameCol]?.[0] || sigmaPlayerId;

  const embed = readEmbedIdentity();
  if (embed) {
    return {
      adapter: 'embed',
      playerId: embed.playerId,
      displayName: embed.displayName,
    };
  }

  if (!isIframed) {
    return {
      adapter: 'local',
      playerId: localPlayerId || null,
      displayName: null,
    };
  }

  return {
    adapter: 'sigma',
    playerId: sigmaPlayerId,
    displayName: sigmaDisplayName,
  };
}
