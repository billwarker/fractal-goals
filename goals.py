from __future__ import annotations

from typing import List, Optional
from datetime import date, datetime
from abc import ABC, abstractmethod
import uuid

class Goal(ABC):
     def __init__(
            self,
            name: str,
            description: str = "",
            parent: Optional['Goal'] = None,
            deadline: Optional[date] = None,
            completed: bool = False,
            created_at: Optional[datetime] = None
            ):
        
        self.id = str(uuid.uuid4())
        self.name = name
        self.description = description
        self.parent = parent
        self.deadline = deadline
        self.completed = completed
        self.created_at = created_at if created_at else datetime.now()
        self.children: List[Goal] = []

        
        if parent:
            parent.add_child(self)
            
     @abstractmethod
     def add_child(self, child: Goal) -> None:
          pass
    
     def to_dict(self):
        return {
            "name": self.name,
            "id": self.id, # Keep ID at top level too for finding in backend list easily, or just in attributes?
                           # react-d3-tree might ignore top level ID. Let's put it in attributes.
                           # But for server.py searching, top level is nice. Let's keep BOTH or strictly attributes.
                           # Let's try strictly attributes to be clean for Frontend, but server needs to know where to look.
            "attributes": {
                "id": self.id,
                "type": self.__class__.__name__,
                "description": self.description,
                "deadline": self.deadline.isoformat() if self.deadline else None,
                "completed": self.completed,
                "created_at": self.created_at.isoformat() if self.created_at else None,
            },
            "children": [child.to_dict() for child in self.children]
        }

     @classmethod
     def from_dict(cls, data, parent=None):
          # This helper determines the correct class to instantiate based on the 'type' field
          # We'll use a mapping or dynamic lookup in the actual reconstruction logic
          # But strictly inside the class, we might want a factory method or external function.
          # For now, let's keep it simple in the class if possible, or leave it to a factory function.
          pass
    
class UltimateGoal(Goal):
     def __init__(
               self,
               name,
               description,
               parent = None,
               deadline: date | None = None,
               completed: bool = False,
               created_at: Optional[datetime] = None
               ):   
         super().__init__(name, description, parent, deadline, completed, created_at)
         self.level = 'ultimate'
         self.children: List[LongTermGoal] = []
     
     def add_child(self, child: LongTermGoal) -> None:
          if not isinstance(child, LongTermGoal):
               raise ValueError(f"Ultimate Goals can only have Long Term Goals as children. Got {type(child).__name__}")
          self.children.append(child)
          child.parent = self

class LongTermGoal(Goal):
     def __init__(
               self,
               name,
               description,
               parent: UltimateGoal | None = None,
               deadline: date | None = None,
               completed: bool = False,
               created_at: Optional[datetime] = None
               ):

          super().__init__(name, description, parent, deadline, completed, created_at)
          self.level = 'long_term'
          self.children: List[MidTermGoal] = []

     def add_child(self, child: MidTermGoal) -> None:
          if not isinstance(child, MidTermGoal):
               raise ValueError(f"Long Term Goals can only have Mid Term Goals as children. Got {type(child).__name__}")
          self.children.append(child)
          child.parent = self

class MidTermGoal(Goal):
     def __init__(
               self,
               name,
               description,
               parent: LongTermGoal | None = None,
               deadline: date | None = None,
               completed: bool = False,
               created_at: Optional[datetime] = None
               ):

          super().__init__(name, description, parent, deadline, completed, created_at)
          self.level = 'mid_term'
          self.children: List[ShortTermGoal] = []

     def add_child(self, child: ShortTermGoal) -> None:
          if not isinstance(child, ShortTermGoal):
               raise ValueError(f"Mid Term Goals can only have Short Term Goals as children. Got {type(child).__name__}")
          self.children.append(child)
          child.parent = self

class ShortTermGoal(Goal):
     def __init__(
               self,
               name,
               description,
               parent: MidTermGoal | None = None,
               deadline: date | None = None,
               completed: bool = False,
               created_at: Optional[datetime] = None
               ):

          super().__init__(name, description, parent, deadline, completed, created_at)
          self.level = 'short_term' # Fixed level name too, was 'long_term' copy paste error?
          self.children: List[PracticeSession] = []

     def add_child(self, child: PracticeSession) -> None:
          if not isinstance(child, PracticeSession):
               raise ValueError(f"Short Term Goals can only have Practice Sessions as children. Got {type(child).__name__}")
          self.children.append(child)
          child.parent = self

class PracticeSession(Goal):
     def __init__(
               self,
               name,
               description,
               parent: ShortTermGoal | None = None,
               parents: List[ShortTermGoal] | None = None,
               deadline: date | None = None,
               completed: bool = False,
               created_at: Optional[datetime] = None
               ):

          # Initialize with single parent for backward compatibility
          super().__init__(name, description, parent, deadline, completed, created_at)
          self.level = 'practice_session'
          self.children: List[ImmediateGoal] = []
          
          # Support multiple parents (many-to-one relationship)
          self.parents: List[ShortTermGoal] = []
          if parents:
               self.parents = parents
               # Add this practice session to all parent's children
               for p in parents:
                    if self not in p.children:
                         p.children.append(self)
          elif parent:
               self.parents = [parent]

     def add_child(self, child: ImmediateGoal) -> None:
          if not isinstance(child, ImmediateGoal):
               raise ValueError(f"Practice Sessions can only have Immediate Goals as children. Got {type(child).__name__}")
          self.children.append(child)
          child.parent = self
     
     def add_parent(self, parent: ShortTermGoal) -> None:
          """Add an additional parent short-term goal to this practice session"""
          if not isinstance(parent, ShortTermGoal):
               raise ValueError(f"Practice Session parents must be ShortTermGoals. Got {type(parent).__name__}")
          if parent not in self.parents:
               self.parents.append(parent)
               if self not in parent.children:
                    parent.children.append(self)
     
     def to_dict(self):
          """Override to include parent_ids list"""
          base_dict = super().to_dict()
          base_dict["attributes"]["parent_ids"] = [p.id for p in self.parents]
          return base_dict

# Session-Level Goals

class ImmediateGoal(Goal):
     def __init__(
               self,
               name,
               description,
               parent: PracticeSession | None = None,
               deadline: date | None = None,
               completed: bool = False,
               created_at: Optional[datetime] = None
               ):

          super().__init__(name, description, parent, deadline, completed, created_at)
          self.level = 'immediate'
          self.children: List[MicroGoal] = []

     def add_child(self, child: MicroGoal) -> None:
          if not isinstance(child, MicroGoal):
               raise ValueError(f"Immediate Goals can only have Micro Goals as children. Got {type(child).__name__}")
          self.children.append(child)
          child.parent = self

class MicroGoal(Goal):
     def __init__(
               self,
               name,
               description,
               parent: ImmediateGoal | None = None,
               deadline: date | None = None,
               completed: bool = False,
               created_at: Optional[datetime] = None
               ):

          super().__init__(name, description, parent, deadline, completed, created_at)
          self.level = 'micro'
          self.children: List[NanoGoal] = []

     def add_child(self, child: NanoGoal) -> None:
          if not isinstance(child, NanoGoal):
               raise ValueError(f"Micro Goals can only have Nano Goals as children. Got {type(child).__name__}")
          self.children.append(child)
          child.parent = self

class NanoGoal(Goal):
     def __init__(
               self,
               name,
               description,
               parent: MicroGoal | None = None,
               deadline: date | None = None,
               completed: bool = False,
               created_at: Optional[datetime] = None
               ):

          super().__init__(name, description, parent, deadline, completed, created_at) # Pass deadline to super
          self.level = 'nano'

     def add_child(self, child: MicroGoal) -> None:
          raise ValueError("Nano goals cannot have children")

def reconstruct_goal(data: dict, parent: Optional[Goal] = None) -> Goal:
    # Handle flat or nested attributes structure
    attrs = data.get("attributes", {})
    # Fallback to top level if not in attributes (migration support)
    type_name = attrs.get("type", data.get("type", "Goal"))
    
    # Map type name to class
    # Ensure the class exists in the global scope
    cls = globals().get(type_name)
    if not cls or not issubclass(cls, Goal):
        raise ValueError(f"Unknown or invalid goal type: {type_name}")
    
    # Extract fields
    name = data.get("name")
    description = attrs.get("description", data.get("description", "")) # default empty per new rule
    deadline_str = attrs.get("deadline", data.get("deadline"))
    completed = attrs.get("completed", data.get("completed", False)) # default False
    created_at_str = attrs.get("created_at", data.get("created_at"))
    
    deadline = date.fromisoformat(deadline_str) if deadline_str else None
    created_at = datetime.fromisoformat(created_at_str) if created_at_str else None
    
    # Instantiate
    # Note: Some classes have different __init__ signatures (some don't have deadline)
    # We need to handle that carefully or standardize __init__?
    # Checking classes:
    # UltimateGoal, LongTermGoal, MidTermGoal, ShortTermGoal: have deadline
    # ImmediateGoal, MicroGoal, NanoGoal: NO deadline in __init__ based on previous read.
    
    if type_name in ["UltimateGoal", "LongTermGoal", "MidTermGoal", "ShortTermGoal", "PracticeSession", "ImmediateGoal", "MicroGoal", "NanoGoal"]:
        goal = cls(name, description, parent, deadline, completed, created_at)
    else:
        goal = cls(name, description, parent, completed=completed, created_at=created_at)

    # Restore ID if present
    if "id" in data:
         goal.id = data["id"]
        
    # Recursively add children
    for child_data in data.get("children", []):
        child = reconstruct_goal(child_data, parent=goal)
        # Note: the __init__ or add_child logic in classes usually handles appending to children list
        # But let's verify if `reconstruct_goal` needs to explicitly call add_child or if the recursion + parent arg does it.
        # In __init__: "if parent: parent.add_child(self)"
        # So passing `parent=goal` to the child's constructor/reconstruct is sufficient!
        
    return goal