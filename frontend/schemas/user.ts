import { z } from "zod";

export const userFormSchema = (isEdit: boolean) =>
  z.object({
    full_name: z.string().trim().min(1, "Name is required").max(150),
    email: z.string().trim().email("Enter a valid email"),
    password: isEdit
      ? z.string().refine((v) => v === "" || v.length >= 10, "At least 10 characters").optional()
      : z.string().min(10, "At least 10 characters"),
    department_id: z.string().optional(),
    roles: z.array(z.string()).min(1, "Assign at least one role"),
    is_active: z.boolean(),
  });
export type UserFormValues = z.infer<ReturnType<typeof userFormSchema>>;

export const departmentFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(20)
    .regex(/^[A-Za-z0-9-_]+$/, "Letters, numbers, - and _ only"),
  description: z.string().max(1000).optional(),
  manager_id: z.string().optional(),
  is_active: z.boolean(),
});
export type DepartmentFormValues = z.infer<typeof departmentFormSchema>;
