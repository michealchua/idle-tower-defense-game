import { useEffect, useRef, useState } from 'react';
import { t } from '../locales/i18n';
import { storyScripts } from '../data/storyConfig';
import { useGameStore } from '../store/useGameStore';
import { IconSteward, type IconProps } from './icons';

const TYPEWRITER_MS_PER_CHAR = 28;

// storyConfig.ts's per-line `avatar` is still an emoji string (every line
// uses the same one - see that file) - mapped to a real icon component here
// rather than rendered as raw emoji text, with the original string kept as
// a safe fallback for any value this map doesn't recognize yet.
const AVATAR_ICON: Record<string, (props: IconProps) => JSX.Element> = {
  '🧙': IconSteward,
};

// Visual-novel-style dialog, fixed to the bottom of the screen - see
// storyConfig.ts for script content and WaveSystem.tickTutorialStoryTrigger
// for the only trigger that exists today (GameState.pendingStoryId). Line
// progression is pure UI state (lineIndex/typedLength) - only "the whole
// script finished" is reported back to the engine, via dismissStory.
function StoryDialog() {
  const pendingStoryId = useGameStore((state) => state.pendingStoryId);
  const dismissStory = useGameStore((state) => state.dismissStory);
  const [lineIndex, setLineIndex] = useState(0);
  const [typedLength, setTypedLength] = useState(0);
  const typewriterTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const script = pendingStoryId ? storyScripts[pendingStoryId] : null;
  const line = script ? script[lineIndex] : null;
  const fullText = line ? t(line.textKey) : '';
  const isFullyTyped = typedLength >= fullText.length;

  // A freshly-activated script (or one that was reset by dismissal) always
  // starts from its first line.
  useEffect(() => {
    setLineIndex(0);
    setTypedLength(0);
  }, [pendingStoryId]);

  useEffect(() => {
    if (!line) {
      return;
    }
    setTypedLength(0);
    typewriterTimer.current = setInterval(() => {
      setTypedLength((prev) => {
        if (prev + 1 >= fullText.length) {
          if (typewriterTimer.current) {
            clearInterval(typewriterTimer.current);
          }
          return fullText.length;
        }
        return prev + 1;
      });
    }, TYPEWRITER_MS_PER_CHAR);
    return () => {
      if (typewriterTimer.current) {
        clearInterval(typewriterTimer.current);
      }
    };
    // fullText itself is derived from lineIndex/pendingStoryId, so those two
    // are the only real dependencies of "which line is currently typing".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineIndex, pendingStoryId]);

  function handleAdvance(): void {
    if (!script || !line) {
      return;
    }
    if (!isFullyTyped) {
      setTypedLength(fullText.length);
      return;
    }
    if (lineIndex < script.length - 1) {
      setLineIndex((index) => index + 1);
    } else {
      dismissStory();
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.code === 'Space') {
        event.preventDefault();
        handleAdvance();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!script || !line) {
    return null;
  }

  return (
    <div className="story-dialog-backdrop" onClick={handleAdvance}>
      <div className="story-dialog">
        <div className="story-dialog-speaker">
          <div className="story-dialog-avatar">
            {AVATAR_ICON[line.avatar] ? (
              (() => {
                const AvatarIcon = AVATAR_ICON[line.avatar];
                return <AvatarIcon size={32} />;
              })()
            ) : (
              line.avatar
            )}
          </div>
          <div className="story-dialog-name">{t(line.speakerNameKey)}</div>
        </div>
        <div className="story-dialog-body">
          <div className="story-dialog-text">{fullText.slice(0, typedLength)}</div>
          {isFullyTyped && <div className="story-dialog-continue">{t('story.continueHint')}</div>}
        </div>
      </div>
    </div>
  );
}

export default StoryDialog;
