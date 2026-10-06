import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin.notifications._template-id");

export const generateMetadata = route.generateMetadata;
export default route.Page;
