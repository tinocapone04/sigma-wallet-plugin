import { useConfig, useEditorPanelConfig, useElementData } from '@sigmacomputing/plugin';
import { CONFIG_OPTIONS } from '../sigma/editorPanel.js';

const isIframed = typeof window !== 'undefined' && window.parent !== window;

// Minimal Sigma identity seam - email is the shared playerId for the wallet API.
export function useViewerIdentity(localPlayerId) {
  useEditorPanelConfig(CONFIG_OPTIONS);
  const config = useConfig();
  const viewerData = useElementData(config.viewerSource);
  const sigmaPlayerId = viewerData[config.viewerEmailCol]?.[0] || null;
  const sigmaDisplayName = viewerData[config.viewerNameCol]?.[0] || sigmaPlayerId;

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
