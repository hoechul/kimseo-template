export const QUOTATION_STATUSES = ['작성중', '발송완료', '수락', '거절', '만료'] as const;

export const QUOTATION_STATUS_COLORS: Record<string, string> = {
  '작성중': 'bg-gray-100 text-gray-800',
  '발송완료': 'bg-blue-100 text-blue-800',
  '수락': 'bg-green-100 text-green-800',
  '거절': 'bg-red-100 text-red-800',
  '만료': 'bg-yellow-100 text-yellow-800',
};

// 견적서에 표시되는 공급자(우리 회사) 기본 정보입니다.
// 본인 회사 정보로 바꿔서 사용하세요. (견적 등록 화면에서 건별로 수정할 수도 있습니다.)
export const DEFAULT_SUPPLIER = {
  supplier_name: '',
  supplier_representative: '',
  supplier_business_number: '',
  supplier_phone: '',
  supplier_manager: '',
  supplier_address: '',
  supplier_business_type: '',
  supplier_business_category: '',
} as const;

export const DEFAULT_BANK_ACCOUNT = '';
