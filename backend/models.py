from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="student")  # 'admin' or 'student'
    year = Column(Integer, nullable=True)  # 1-4 for students
    student_id = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    loans = relationship("LoanRequest", back_populates="student", foreign_keys="LoanRequest.student_id")
    approved_loans = relationship("LoanRequest", back_populates="approved_by_user", foreign_keys="LoanRequest.approved_by")


class Equipment(Base):
    __tablename__ = "equipment"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    quantity = Column(Integer, default=1)
    insured = Column(Boolean, default=False)
    price = Column(Float, default=0.0)
    location = Column(String, nullable=True)
    manufacturer = Column(String, nullable=True)
    model_name = Column(String, nullable=True)
    tag_id = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    kit_items = relationship("KitItem", back_populates="equipment")


class Kit(Base):
    __tablename__ = "kits"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    name_en = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=False)
    min_year = Column(Integer, default=1)
    max_year = Column(Integer, default=4)
    image_url = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("KitItem", back_populates="kit")
    loans = relationship("LoanRequest", back_populates="kit")


class KitItem(Base):
    __tablename__ = "kit_items"

    id = Column(Integer, primary_key=True, index=True)
    kit_id = Column(Integer, ForeignKey("kits.id"), nullable=False)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False)
    quantity_needed = Column(Integer, default=1)

    kit = relationship("Kit", back_populates="items")
    equipment = relationship("Equipment", back_populates="kit_items")


class LoanRequest(Base):
    __tablename__ = "loan_requests"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # אחד מהשניים חייב להיות מאוכלס: kit_id (השאלת ערכה) או equipment_id (פריט בודד)
    kit_id = Column(Integer, ForeignKey("kits.id"), nullable=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=True)
    quantity = Column(Integer, default=1)  # רלוונטי בעיקר ל-equipment_id (כמה פריטים)
    batch_id = Column(String, nullable=True, index=True)  # מקבץ של השאלות שנשלחו ביחד (UUID)
    status = Column(String, default="pending")  # pending/approved/active/returned/rejected/cancelled
    requested_at = Column(DateTime, default=datetime.utcnow)
    loan_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    return_date = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    manager_notes = Column(Text, nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    preferred_date = Column(DateTime, nullable=True)

    student = relationship("User", back_populates="loans", foreign_keys=[student_id])
    approved_by_user = relationship("User", back_populates="approved_loans", foreign_keys=[approved_by])
    kit = relationship("Kit", back_populates="loans")
    equipment = relationship("Equipment", foreign_keys=[equipment_id])


class ActivityLog(Base):
    """לוג פעולות אדמיניסטרטיביות במערכת.
    כל אישור/דחיה/החזרה/יצירת ציוד מתועדים כאן."""
    __tablename__ = "activity_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)  # e.g. 'loan.approved', 'loan.rejected', 'loan.returned', 'equipment.created'
    entity_type = Column(String, nullable=True)  # 'loan', 'equipment', 'kit', 'user'
    entity_id = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)  # human-readable text in Hebrew
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", foreign_keys=[user_id])


class Notification(Base):
    """התראות בתוך האפליקציה — מופנות למשתמש."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False)  # 'loan_approved' / 'loan_rejected' / 'loan_overdue' / 'new_request' / 'loan_returned'
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    link = Column(String, nullable=True)  # frontend route, e.g. '/student/loans'
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", foreign_keys=[user_id])
