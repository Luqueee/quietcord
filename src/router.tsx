import React, {useMemo} from 'react';
import {useAppState} from './app.js';
import {ModeSelect} from './ui/components/ModeSelect.js';
import {GuildsView} from './ui/components/GuildsView.js';
import {ChannelsView} from './ui/components/ChannelsView.js';
import {ChatView} from './ui/components/ChatView.js';
import {StealthPicker} from './ui/components/StealthPicker.js';
import {StealthInput} from './ui/components/StealthInput.js';
import {StealthChatView} from './ui/components/StealthChatView.js';
import {makeMentionResolver} from './state/mention.js';
import type {MentionResolver} from './markdown/types.js';

type Resolver = MentionResolver & {getVoiceMembers: () => {id: string; name: string}[]};

export function Router() {
  const {state, dispatch, onSelectGuild, onSelectChannel} = useAppState();

  const resolver = useMemo<Resolver>(
    () => makeMentionResolver(state),
    [state]
  );

  if (state.view === 'mode-select') {
    return <ModeSelect onSelect={mode => dispatch({type: 'pick-mode', mode})} />;
  }

  if (state.mode === 'stealth') {
    if (state.view === 'stealth-guilds') {
      return <StealthPicker title="Servidor:" items={state.guilds} onSelect={onSelectGuild} />;
    }
    if (state.view === 'stealth-channels') {
      return <StealthPicker title="Canal:" items={state.channels} onSelect={onSelectChannel} />;
    }
    if (state.view === 'chat' && state.currentChannel) {
      return (
        <StealthChatView
          channel={state.currentChannel}
          messages={state.messages}
          draft={state.draft}
          visible={state.historyVisible}
          loadingHistory={state.loadingHistory}
        />
      );
    }
  }

  if (state.view === 'guilds') {
    return <GuildsView guilds={state.guilds} onSelect={onSelectGuild} />;
  }
  if (state.view === 'channels' && state.currentGuild) {
    return (
      <ChannelsView
        guild={state.currentGuild}
        channels={state.channels}
        onSelect={onSelectChannel}
      />
    );
  }
  if (state.view === 'chat' && state.currentChannel) {
    return (
      <ChatView
        channel={state.currentChannel}
        messages={state.messages}
        draft={state.draft}
        resolver={resolver}
        statusFlash={null}
        queueSize={state.queueSize}
        unread={state.unread}
        voiceStates={state.voiceStates}
        loadingHistory={state.loadingHistory}
        visible
        showStatusBar
      />
    );
  }

  return <StealthInput draft={state.draft} visible />;
}
