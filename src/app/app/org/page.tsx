'use client';

import { useState } from 'react';
import { Building2, ChevronRight } from 'lucide-react';
import OrganizationManager from '@/components/org/OrganizationManager';
import DepartmentManager from '@/components/org/DepartmentManager';
import ProjectManager from '@/components/org/ProjectManager';
import MemberManager from '@/components/org/MemberManager';

interface Organization { id: string; name: string; created_at: string; }
interface Department   { id: string; name: string; organization_id: string; created_at: string; }

export default function OrgPage() {
  const [selectedOrg,  setSelectedOrg]  = useState<Organization | null>(null);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);

  const handleSelectOrg = (org: Organization) => {
    setSelectedOrg(org);
    setSelectedDept(null); // clear dept selection when org changes
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#F7F5F2]">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#E5E2DE] bg-white shrink-0">
        <div className="flex items-center gap-2 text-[13px] text-[#B0ADA9]">
          <Building2 className="w-4 h-4 text-[#E8521A]" />
          <span className="font-semibold text-[#0F0F0F] text-[15px]">Organization Management</span>
          {selectedOrg && (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-[#5C5855]">{selectedOrg.name}</span>
            </>
          )}
          {selectedDept && (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-[#5C5855]">{selectedDept.name}</span>
            </>
          )}
        </div>
        <p className="text-[11px] text-[#B0ADA9] mt-1">
          Create organizations, add departments, manage projects and team members.
        </p>
      </div>

      {/* Content grid */}
      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">

          {/* Col 1: Organizations */}
          <OrganizationManager
            onSelectOrg={handleSelectOrg}
            selectedOrgId={selectedOrg?.id}
          />

          {/* Col 2: Departments — only visible once an org is selected */}
          {selectedOrg ? (
            <DepartmentManager
              organizationId={selectedOrg.id}
              organizationName={selectedOrg.name}
              onSelectDept={setSelectedDept}
              selectedDeptId={selectedDept?.id}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-[#E5E2DE] p-5 flex items-center justify-center min-h-[120px]">
              <p className="text-[13px] text-[#B0ADA9] text-center">Select an organization<br />to manage departments</p>
            </div>
          )}

          {/* Col 3: Projects — only visible once a dept is selected */}
          {selectedDept ? (
            <ProjectManager
              departmentId={selectedDept.id}
              departmentName={selectedDept.name}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-[#E5E2DE] p-5 flex items-center justify-center min-h-[120px]">
              <p className="text-[13px] text-[#B0ADA9] text-center">Select a department<br />to manage projects</p>
            </div>
          )}

          {/* Col 4: Members — only visible once a dept is selected */}
          {selectedDept ? (
            <MemberManager
              departmentId={selectedDept.id}
              departmentName={selectedDept.name}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-[#E5E2DE] p-5 flex items-center justify-center min-h-[120px]">
              <p className="text-[13px] text-[#B0ADA9] text-center">Select a department<br />to manage members</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
