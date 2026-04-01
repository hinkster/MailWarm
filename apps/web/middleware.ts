import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/domains/:path*",
    "/warming/:path*",
    "/analytics/:path*",
    "/settings/:path*",
  ],
};
