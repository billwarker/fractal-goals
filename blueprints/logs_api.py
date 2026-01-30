from flask import Blueprint, jsonify, request
from models import EventLog, get_scoped_session, validate_root_goal
from blueprints.auth_api import token_required
from sqlalchemy import select, desc
from services.serializers import serialize_event_log
import logging

logger = logging.getLogger(__name__)

logs_api = Blueprint('logs_api', __name__)

@logs_api.route('/api/<root_id>/logs', methods=['GET'])
@token_required
def get_logs(current_user, root_id):
    """
    Get all event logs for a specific fractal if owned by user.
    """
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    event_type = request.args.get('event_type')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    db_session = get_scoped_session()
    try:
        # Verify ownership
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        from sqlalchemy import func
        from datetime import datetime
        
        # Create base query
        stmt = select(EventLog).where(EventLog.root_id == root_id)
        
        # Apply filters
        if event_type and event_type != 'all':
            stmt = stmt.where(EventLog.event_type == event_type)
        
        if start_date:
            try:
                # Handle ISO date strings
                s_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                stmt = stmt.where(EventLog.timestamp >= s_dt)
            except ValueError:
                pass
                
        if end_date:
            try:
                # Append end of day time for date-only filters
                if len(end_date) <= 10: # YYYY-MM-DD
                    end_date += "T23:59:59"
                e_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                stmt = stmt.where(EventLog.timestamp <= e_dt)
            except ValueError:
                pass
        
        # Get total count for pagination WITH filters applied
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_count = db_session.execute(count_stmt).scalar()
        
        # Final ordering, limit and offset
        stmt = stmt.order_by(desc(EventLog.timestamp)).limit(limit).offset(offset)
        
        results = db_session.execute(stmt).scalars().all()
        
        # Also get all available event types for the filter dropdown
        types_stmt = select(EventLog.event_type).where(EventLog.root_id == root_id).distinct()
        event_types = [t for t in db_session.execute(types_stmt).scalars().all()]
        
        return jsonify({
            "logs": [serialize_event_log(log) for log in results],
            "event_types": sorted(event_types),
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total": total_count,
                "count": len(results),
                "has_more": (offset + limit) < total_count
            }
        })
    except Exception as e:
        logger.exception(f"Error fetching logs for root {root_id}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()

@logs_api.route('/api/<root_id>/logs/clear', methods=['DELETE'])
@token_required
def clear_logs(current_user, root_id):
    """
    Clear all logs for a specific fractal.
    """
    db_session = get_scoped_session()
    try:
        # Verify ownership
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
        from sqlalchemy import delete
        
        # Delete logs
        stmt = delete(EventLog).where(EventLog.root_id == root_id)
        db_session.execute(stmt)
        db_session.commit()
        
        logger.info(f"Cleared logs for root {root_id}")
        return jsonify({"message": "Logs cleared successfully"})
        
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error clearing logs for root {root_id}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
