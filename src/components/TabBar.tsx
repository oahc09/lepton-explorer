import { useLocationStore } from '../state/locationStore';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function TabBar() {
  const tabs = useLocationStore((s) => s.tabs);
  const activeId = useLocationStore((s) => s.activeId);
  const setActive = useLocationStore((s) => s.setActive);
  const addTab = useLocationStore((s) => s.addTab);
  const closeTab = useLocationStore((s) => s.closeTab);

  const onClose = async (id: string) => {
    const ok = closeTab(id);
    if (!ok) {
      await getCurrentWindow().close(); // last tab -> close window
    }
  };

  return (
    <div className="tabbar" data-tauri-drag-region>
      {tabs.map((t) => (
        <div
          key={t.id}
          className={`tab${t.id === activeId ? ' active' : ''}`}
          onClick={() => setActive(t.id)}
          onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); void onClose(t.id); } }}
        >
          <span className="tab-title">📁 {t.title}</span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(t.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="tab-add"
        onClick={() => addTab('')}
        title="新标签页 (Ctrl+T)"
      >
        ＋
      </button>
    </div>
  );
}
