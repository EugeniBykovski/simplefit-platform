import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin.users._user-id");

export const generateMetadata = route.generateMetadata;
export default route.Page;
