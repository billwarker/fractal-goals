import styles from './SessionSection.module.css';

export default function SessionActivityDragCard({ instance, definition, sectionIndex, setDraggedItem, isDragging, children }) {
    return (
        <div data-session-activity-card="true" data-session-activity-instance-id={instance.id}
            draggable onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                setDraggedItem({ instanceId: instance.id, sourceSectionIndex: sectionIndex, activityName: definition?.name || 'Activity' });
            }}
            onDragEnd={() => setDraggedItem(null)}
            className={`${styles.draggableActivity} ${isDragging ? styles.draggableActivityDragging : ''}`}>
            {children}
        </div>
    );
}
