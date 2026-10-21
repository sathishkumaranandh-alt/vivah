import { z } from 'zod';

// 🔒 Middleware for validating request body against a Zod schema
export const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Return the first error message for simplicity
      const message = error.errors[0]?.message || "Invalid input data";
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: "Validation failed" });
  }
};

// 🔒 Schemas
export const interestSchema = z.object({
  receiver_id: z.string().uuid({ message: "Invalid receiver ID format" }),
  type: z.enum(["interest", "super_like"]).optional(),
});

export const messageSchema = z.object({
  receiver_id: z.string().uuid({ message: "Invalid receiver ID format" }),
  text: z.string().max(1000, { message: "Message too long (max 1000 chars)" }).optional(),
  image_url: z.string().url({ message: "Invalid image URL" }).max(2048).refine((u) => u.startsWith("https://"), { message: "Image URL must be https" }).optional(),
  message_type: z.enum(["text", "image"]).optional(),
}).refine(data => data.text || data.image_url, {
  message: "Message must contain either text or an image",
});

export const profileUpdateSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }).max(50).optional(),
  age: z.number().min(18, { message: "Age must be 18+" }).max(100).optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  mobile: z.string().regex(/^[0-9]{10}$/, { message: "Mobile must be 10 digits" }).optional().nullable(),
  bio: z.string().max(500, { message: "Bio too long" }).optional().nullable(),
});
  
