import React from 'react';
import moment from 'moment';
import { getGoalColor } from '../../utils/goalColors';
import { isBlockActive, ActiveBlockBadge } from '../../utils/programUtils';

function ProgramBlockView({
    blocks, // sortedBlocks
    sessions,
    goals,
    onEditDay,
    onAttachGoal,
    onEditBlock,
    onDeleteBlock,
    onAddDay,
    onGoalClick
}) {
    // Helper formatter
    const formatDate = (dateString) => {
        if (!dateString) return '';
        return moment(dateString).format('MMM D, YYYY');
    };

    if (!blocks || blocks.length === 0) {
        return <div style={{ color: '#666', fontStyle: 'italic' }}>No blocks defined. Switch to Calendar to add blocks.</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ color: 'white', fontSize: '18px' }}>Blocks</h2>
            </div>

            {blocks.map(block => {
                const start = moment(block.start_date);
                const end = moment(block.end_date);
                const durationDays = end.diff(start, 'days') + 1;

                return (
                    <div key={block.id} style={{
                        background: '#1e1e1e',
                        borderRadius: '12px',
                        padding: '24px',
                        borderLeft: `4px solid ${block.color || '#3A86FF'}`,
                        display: 'flex',
                        gap: '40px',
                        marginBottom: '16px'
                    }}>
                        {/* Main content: Info + Days */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Block Info Section */}
                            <div style={{ marginBottom: '24px' }}>
                                {/* Row 1: Name, Badge, Dates, Days Remaining */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: 600 }}>{block.name}</h3>
                                    {isBlockActive(block) && <ActiveBlockBadge />}

                                    <div style={{ color: '#666', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>{formatDate(block.start_date)} - {formatDate(block.end_date)} • {durationDays} Days</span>
                                        {isBlockActive(block) && (
                                            <span style={{ color: block.color || '#3A86FF', fontWeight: 600 }}>
                                                • {Math.max(0, moment(block.end_date).startOf('day').diff(moment().startOf('day'), 'days'))} Days Remaining
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Row 2: Goal Badges */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                                    {(() => {
                                        const blockStart = moment(block.start_date).startOf('day');
                                        const blockEnd = moment(block.end_date).endOf('day');

                                        const associatedGoals = goals.filter(g => {
                                            if (block.goal_ids?.includes(g.id)) return true;
                                            if (g.deadline) {
                                                const d = moment(g.deadline);
                                                return d.isSameOrAfter(blockStart) && d.isSameOrBefore(blockEnd);
                                            }
                                            return false;
                                        });

                                        associatedGoals.sort((a, b) => {
                                            if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
                                            if (a.deadline) return -1;
                                            if (b.deadline) return 1;
                                            return a.name.localeCompare(b.name);
                                        });

                                        return associatedGoals.map(g => {
                                            const goalType = g.attributes?.type || g.type;
                                            const goalColor = getGoalColor(goalType);
                                            const isCompleted = g.completed || g.attributes?.completed;
                                            return (
                                                <div key={g.id} style={{
                                                    background: 'transparent',
                                                    border: `1px solid ${goalColor}`,
                                                    color: goalColor,
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    fontWeight: 500,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    textDecoration: isCompleted ? 'line-through' : 'none',
                                                    opacity: isCompleted ? 0.7 : 1,
                                                    whiteSpace: 'nowrap',
                                                    cursor: 'pointer'
                                                }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onGoalClick(g);
                                                    }}
                                                    title={g.name}
                                                >
                                                    {isCompleted && <span>✓</span>}
                                                    <span>{g.name}</span>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>

                            {/* Days Grid Section */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px'
                            }}>
                                {(() => {
                                    // Deduplicate and filter days
                                    const seenKeys = new Set();
                                    const sortedDays = [...(block.days || [])].sort((a, b) => {
                                        if (!a.date && b.date) return -1;
                                        if (a.date && !b.date) return 1;
                                        return 0;
                                    });

                                    const uniqueDays = sortedDays.filter(day => {
                                        const templateIds = (day.templates || []).map(t => t.id).sort().join(',');
                                        const key = `${day.name}-${templateIds}`;
                                        if (seenKeys.has(key)) return false;
                                        seenKeys.add(key);
                                        return true;
                                    });

                                    if (uniqueDays.length === 0) {
                                        return <div style={{ color: '#444', fontSize: '13px', fontStyle: 'italic', gridColumn: '1 / -1' }}>No days added yet. Click "+ Add Day" to start your plan.</div>;
                                    }

                                    return uniqueDays.map(day => (
                                        <div key={day.id}
                                            onClick={() => onEditDay(block.id, day)}
                                            style={{
                                                background: '#242424',
                                                padding: '16px',
                                                borderRadius: '8px',
                                                minHeight: '100px',
                                                cursor: 'pointer',
                                                border: '1px solid #333',
                                                transition: 'all 0.2s',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '12px'
                                            }}
                                            onMouseOver={e => {
                                                e.currentTarget.style.borderColor = '#444';
                                                e.currentTarget.style.background = '#2a2a2a';
                                            }}
                                            onMouseOut={e => {
                                                e.currentTarget.style.borderColor = '#333';
                                                e.currentTarget.style.background = '#242424';
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <div style={{ color: '#eee', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                                                        {day.name}
                                                    </div>
                                                    {(() => {
                                                        const mapping = day.day_of_week;
                                                        if (Array.isArray(mapping) && mapping.length > 0) {
                                                            const dayMap = {
                                                                'Monday': 'Mon', 'Tuesday': 'Tues', 'Wednesday': 'Wed', 'Thursday': 'Thurs',
                                                                'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun'
                                                            };
                                                            const dayStr = mapping.length === 7 ? 'Daily' : mapping.map(d => dayMap[d] || d.substring(0, 3)).join(' | ');
                                                            return <div style={{ color: '#777', fontSize: '10px', fontWeight: 500 }}>{dayStr}</div>;
                                                        } else if (day.date) {
                                                            return <div style={{ color: '#777', fontSize: '10px', fontWeight: 500 }}>{moment(day.date).format('dddd')}</div>;
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                                {(() => {
                                                    const blockStart = moment(block.start_date).startOf('day');
                                                    const blockEnd = moment(block.end_date).endOf('day');
                                                    const daySessions = sessions.filter(s => {
                                                        if (s.program_day_id !== day.id || !s.completed) return false;
                                                        const sessDate = moment(s.session_start || s.created_at);
                                                        return sessDate.isSameOrAfter(blockStart) && sessDate.isSameOrBefore(blockEnd);
                                                    });

                                                    const completedTemplateIds = new Set(daySessions.filter(s => s.template_id).map(s => s.template_id));
                                                    const templates = day.templates || [];
                                                    const isFullComplete = templates.length > 0 && templates.every(t => completedTemplateIds.has(t.id));

                                                    if (daySessions.length > 0) {
                                                        return (
                                                            <div style={{ color: '#4caf50', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                                {daySessions.length} {isFullComplete && '✓'}
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>

                                            {/* Day Templates (Sessions) */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {(() => {
                                                    const blockStart = moment(block.start_date).startOf('day');
                                                    const blockEnd = moment(block.end_date).endOf('day');
                                                    const daySessions = sessions.filter(s => {
                                                        if (s.program_day_id !== day.id || !s.completed) return false;
                                                        const sessDate = moment(s.session_start || s.created_at);
                                                        return sessDate.isSameOrAfter(blockStart) && sessDate.isSameOrBefore(blockEnd);
                                                    });

                                                    if (day.templates?.length > 0) {
                                                        return day.templates.map(template => {
                                                            const tSessions = daySessions.filter(s => s.template_id === template.id);
                                                            const sCount = tSessions.length;
                                                            const isDone = sCount > 0;

                                                            return (
                                                                <div key={template.id} style={{
                                                                    fontSize: '11px',
                                                                    color: isDone ? '#c8e6c9' : '#bbb',
                                                                    background: isDone ? '#1b5e20' : '#333',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '4px',
                                                                    borderLeft: isDone ? '2px solid #4caf50' : '2px solid #555',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between'
                                                                }}>
                                                                    <span>{isDone ? '✓ ' : ''}{template.name}</span>
                                                                    {sCount > 1 && <span>{sCount}</span>}
                                                                </div>
                                                            );
                                                        });
                                                    }
                                                    return <div style={{ fontSize: '10px', color: '#444', fontStyle: 'italic' }}>Rest</div>;
                                                })()}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>

                        {/* Actions Section */}
                        <div style={{ flex: '0 0 120px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button onClick={() => onAttachGoal(block.id)} style={{ background: '#333', border: '1px solid #444', color: '#ccc', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', width: '100%' }}>Attach Goal</button>
                            <button onClick={() => onEditBlock(block)} style={{ background: '#333', border: '1px solid #444', color: '#ccc', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', width: '100%' }}>Edit Block</button>
                            <button onClick={() => onDeleteBlock(block.id)} style={{ background: '#d32f2f', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, width: '100%' }}>Delete Block</button>
                            <button onClick={() => onAddDay(block.id)} style={{ background: '#3A86FF', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 500, width: '100%' }}>+ Add Day</button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default ProgramBlockView;
