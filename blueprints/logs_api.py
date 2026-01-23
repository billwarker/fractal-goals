from flask import Blueprint, jsonify, request
from models import EventLog, get_scoped_session
from sqlalchemy import select, desc
import logging

logger = logging.getLogger(__name__)

logs_api = Blueprint('logs_api', __name__)

@logs_api.route('/api/<root_id>/logs', methods=['GET'])
def get_logs(root_id):
    """
    Get all event logs for a specific fractal.
    Supports pagination.
    """
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    
    db_session = get_scoped_session()
    try:
        # Create base query
        stmt = select(EventLog).where(
            EventLog.root_id == root_id
        ).order_by(desc(EventLog.timestamp))
        
        # Get total count for pagination
        # (Simplified for now, as we're usually interested in recent logs)
        
        # Apply limit and offset
        stmt = stmt.limit(limit).offset(offset)
        
        results = db_session.execute(stmt).scalars().all()
        
        return jsonify({
            "logs": [log.to_dict() for log in results],
            "pagination": {
                "limit": limit,
                "offset": offset,
                "count": len(results)
            }
        })
    except Exception as e:
        logger.exception(f"Error fetching logs for root {root_id}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()

@logs_api.route('/api/<root_id>/logs/clear', methods=['DELETE'])
def clear_logs(root_id):
    """
    Clear all logs for a specific fractal.
    """
    db_session = get_scoped_session()
    try:
        from sqlalchemy import delete
        stmt = delete(EventLog).where(EventLog.root_id == root_id)
        db_session.execute(stmt)
        db_session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error clearing logs for root {root_id}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
