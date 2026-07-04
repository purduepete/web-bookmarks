interface Props {
    profiles: string[];
    disabledProfiles: Set<string>;
    activeProfile: string;
    onProfileChange: (profile: string) => void;
}

// Row of clickable profile tabs (primary UX for switching the active profile).
// Rendered only when more than one profile is enabled.
export default function ProfileTabs({ profiles, disabledProfiles, activeProfile, onProfileChange }: Props) {
    const visible = profiles.filter((p) => !disabledProfiles.has(p));
    if (visible.length <= 1) return null;
    return (
        <div className="profile-tabs">
            {visible.map((p) => (
                <button
                    key={p}
                    className={`profile-tab${p === activeProfile ? ' profile-tab-active' : ''}`}
                    onClick={() => onProfileChange(p)}
                >
                    {p}
                </button>
            ))}
        </div>
    );
}
