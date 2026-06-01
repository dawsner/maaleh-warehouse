from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, List
from datetime import datetime


# Auth schemas
class LoginRequest(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


# User schemas
class UserBase(BaseModel):
    name: str
    email: str
    role: str = "student"
    year: Optional[int] = None
    student_id: Optional[str] = None
    phone: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    year: Optional[int] = None
    student_id: Optional[str] = None
    phone: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None


class UserOut(UserBase):
    id: int
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Equipment schemas
class EquipmentBase(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    name: str
    category: str
    quantity: int = 1
    insured: bool = False
    price: float = 0.0
    location: Optional[str] = None
    manufacturer: Optional[str] = None
    model_name: Optional[str] = None
    tag_id: Optional[str] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    min_year: int = 1
    max_year: int = 4


class EquipmentCreate(EquipmentBase):
    pass


class EquipmentUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    name: Optional[str] = None
    category: Optional[str] = None
    quantity: Optional[int] = None
    insured: Optional[bool] = None
    price: Optional[float] = None
    location: Optional[str] = None
    manufacturer: Optional[str] = None
    model_name: Optional[str] = None
    tag_id: Optional[str] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    min_year: Optional[int] = None
    max_year: Optional[int] = None
    active: Optional[bool] = None


class EquipmentOut(EquipmentBase):
    id: int
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Kit schemas
class KitItemCreate(BaseModel):
    equipment_id: int
    quantity_needed: int = 1


class KitItemOut(BaseModel):
    id: int
    equipment_id: int
    quantity_needed: int
    equipment: EquipmentOut

    class Config:
        from_attributes = True


class KitBase(BaseModel):
    name: str
    name_en: Optional[str] = None
    description: Optional[str] = None
    category: str
    min_year: int = 1
    max_year: int = 4
    image_url: Optional[str] = None


class KitCreate(KitBase):
    items: List[KitItemCreate] = []


class KitUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    min_year: Optional[int] = None
    max_year: Optional[int] = None
    image_url: Optional[str] = None
    active: Optional[bool] = None
    items: Optional[List[KitItemCreate]] = None


class KitOut(KitBase):
    id: int
    active: bool
    created_at: datetime
    items: List[KitItemOut] = []

    class Config:
        from_attributes = True


class KitAvailability(BaseModel):
    is_available: bool
    count_available: int


# Loan schemas
class LoanRequestCreate(BaseModel):
    """תאימות אחורה: יצירת בקשה לערכה בודדת."""
    kit_id: Optional[int] = None
    equipment_id: Optional[int] = None  # חדש: ניתן לבקש פריט בודד
    quantity: int = 1
    notes: Optional[str] = None
    preferred_date: Optional[datetime] = None


class LoanBatchItem(BaseModel):
    """פריט בעגלה — או ערכה או ציוד."""
    kit_id: Optional[int] = None
    equipment_id: Optional[int] = None
    quantity: int = 1


class LoanBatchCreate(BaseModel):
    """שליחה של עגלת קניות שלמה — כמה ערכות ופריטים יחד."""
    items: List[LoanBatchItem]
    notes: Optional[str] = None
    preferred_date: Optional[datetime] = None


class LoanApprove(BaseModel):
    loan_date: datetime
    due_date: datetime
    manager_notes: Optional[str] = None


class LoanReject(BaseModel):
    manager_notes: Optional[str] = None


class LoanOut(BaseModel):
    id: int
    student_id: int
    kit_id: Optional[int] = None
    equipment_id: Optional[int] = None
    quantity: int = 1
    batch_id: Optional[str] = None
    status: str
    requested_at: datetime
    loan_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    return_date: Optional[datetime] = None
    notes: Optional[str] = None
    manager_notes: Optional[str] = None
    approved_by: Optional[int] = None
    preferred_date: Optional[datetime] = None
    student: Optional[UserOut] = None
    kit: Optional[KitOut] = None
    equipment: Optional[EquipmentOut] = None
    is_overdue: bool = False
    days_overdue: int = 0

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_equipment: int
    active_kits: int
    open_loans: int
    pending_requests: int


# Order schemas (architecture חדש — מחליף את LoanRequest)
class OrderItemCreate(BaseModel):
    kit_id: Optional[int] = None
    equipment_id: Optional[int] = None
    quantity: int = 1


class OrderItemUpdate(BaseModel):
    quantity: Optional[int] = None
    returned_at: Optional[datetime] = None
    mark_returned: Optional[bool] = None  # קיצור — שולח True כדי לסמן עכשיו


class OrderItemOut(BaseModel):
    id: int
    order_id: int
    kit_id: Optional[int] = None
    equipment_id: Optional[int] = None
    quantity: int = 1
    returned_at: Optional[datetime] = None
    added_at: datetime
    added_by: Optional[int] = None
    kit: Optional[KitOut] = None
    equipment: Optional[EquipmentOut] = None

    class Config:
        from_attributes = True


class CrewMember(BaseModel):
    name: str
    role: Optional[str] = None


class OrderCreate(BaseModel):
    """יצירת הזמנה ראשונית — אפשר עם או בלי פריטים."""
    items: List[OrderItemCreate] = []
    notes: Optional[str] = None
    preferred_date: Optional[datetime] = None
    loan_date: Optional[datetime] = None       # מ-
    due_date: Optional[datetime] = None         # עד-
    production_name: Optional[str] = None
    crew: Optional[List[CrewMember]] = None


class OrderUpdate(BaseModel):
    """עדכון פרטי הזמנה — סטודנט יכול לעדכן notes/dates/production/crew; מנהל גם manager_notes."""
    notes: Optional[str] = None
    manager_notes: Optional[str] = None
    preferred_date: Optional[datetime] = None
    loan_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    production_name: Optional[str] = None
    crew: Optional[List[CrewMember]] = None


class OrderApprove(BaseModel):
    loan_date: datetime
    due_date: datetime
    manager_notes: Optional[str] = None


class OrderReject(BaseModel):
    manager_notes: Optional[str] = None


class OrderOut(BaseModel):
    id: int
    student_id: int
    status: str
    requested_at: datetime
    preferred_date: Optional[datetime] = None
    loan_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    production_name: Optional[str] = None
    crew: Optional[List[CrewMember]] = None  # parsed JSON
    notes: Optional[str] = None
    manager_notes: Optional[str] = None
    approved_by: Optional[int] = None
    closed_by: Optional[int] = None
    last_modified_at: datetime
    student: Optional[UserOut] = None
    items: List[OrderItemOut] = []
    # שדות מחושבים
    item_count: int = 0
    returned_count: int = 0
    is_overdue: bool = False
    days_overdue: int = 0

    class Config:
        from_attributes = True
