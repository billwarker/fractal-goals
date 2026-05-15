import React from 'react';
import { createPortal } from 'react-dom';

import styles from './ActivityAssociator.module.css';

const InlineGroupCreator = ({
    eligibleParentGroups,
    groupBreadcrumb,
    isCreatingGroup,
    newGroupName,
    newGroupParentId,
    onCancel,
    onCreate,
    onGroupNameChange,
    onParentChange,
}) => {
    const modalContent = (
        <div className={styles.groupCreatorModalOverlay} onClick={onCancel}>
            <div className={styles.groupCreatorModalContent} onClick={(event) => event.stopPropagation()}>
                <h5 className={styles.groupCreatorTitle}>New Activity Group</h5>
                <div className={styles.groupCreatorFields}>
                    <input
                        type="text"
                        value={newGroupName}
                        onChange={(event) => onGroupNameChange(event.target.value)}
                        placeholder="Group name..."
                        className={styles.groupCreatorInput}
                        autoFocus
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') onCreate();
                            if (event.key === 'Escape') onCancel();
                        }}
                    />
                    <select
                        value={newGroupParentId}
                        onChange={(event) => onParentChange(event.target.value)}
                        className={styles.groupCreatorSelect}
                    >
                        <option value="">(Root level)</option>
                        {eligibleParentGroups.map((group) => (
                            <option key={group.id} value={group.id}>
                                {groupBreadcrumb(group.id)}
                            </option>
                        ))}
                    </select>
                </div>
                <div className={styles.groupCreatorActions}>
                    <button
                        onClick={onCreate}
                        disabled={isCreatingGroup || !newGroupName.trim()}
                        className={styles.groupCreatorSaveBtn}
                    >
                        {isCreatingGroup ? 'Creating...' : 'Create Group'}
                    </button>
                    <button onClick={onCancel} className={styles.groupCreatorCancelBtn}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default InlineGroupCreator;
