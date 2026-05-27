%% ==========================================
%  GSSAM Buck-Boost Converter – 8-State Closed Loop
%  WITH Anti-Windup on PI Integrators
%% ==========================================
clear all; clc;

%% ------------------------------------------
% Parameters
%% ------------------------------------------
Vin = 18;
L   = 150e-6;
C   = 100e-6;
R   = 10;
T   = 1/40000;
fs  = 1/T;
Vm  = 1;
Ts  = T;
w   = 2*pi*fs;

d   = 0.4;
Vo_mag = Vin * d / (1 - d);
Vr     = Vo_mag;

Ks1 = 1;  Ks2 = 1;

Kp1 = 0.002;   Ki1 = 20;
K1  = Kp1;      Tt1 = Kp1/Ki1;

Kp2 = 0.01;    Ki2 = 50;
K2  = Kp2;      Tt2 = Kp2/Ki2;

%% ------------------------------------------
% Step Reference
%% ------------------------------------------
Vr_initial = Vo_mag;
Vr_final   = Vo_mag;
t_step     = 60e-3;
Vr = Vr_initial;

%% ------------------------------------------
% Operating point
%% ------------------------------------------
a = sin(2*pi*d)/(2*pi);
b = (cos(2*pi*d)-1)/(2*pi);

vo0_e = Vo_mag;
iL0_e = vo0_e / (R * (1 - d));

fprintf('=== Operating Point ===\n');
fprintf('  D    = %.2f\n', d);
fprintf('  |Vo| = %.2f V\n', vo0_e);
fprintf('  IL   = %.3f A\n', iL0_e);

%% ==========================================
%  Nonlinear GSSAM Simulation
%% ==========================================
fprintf('\nRunning nonlinear GSSAM simulation...\n');

tspan = [0, 0.1];
X0 = zeros(8,1);

params.Vin = Vin;  params.L = L;  params.C = C;
params.R = R;      params.w = w;  params.Vm = Vm;
params.Kp1 = Kp1;  params.Ki1 = Ki1;
params.Kp2 = Kp2;  params.Ki2 = Ki2;
params.Vr_initial = Vr_initial;
params.Vr_final   = Vr_final;
params.t_step     = t_step;

opts = odeset('RelTol',1e-6,'AbsTol',1e-9,'MaxStep',1e-6);
[t1, X1] = ode45(@(t,x) gssam_buckboost_cl_ode(t, x, params), [0, t_step], X0, opts);
[t2, X2] = ode45(@(t,x) gssam_buckboost_cl_ode(t, x, params), [t_step, 0.1], X1(end,:)', opts);

t = [t1; t2(2:end)];
X = [X1; X2(2:end,:)];

fprintf('GSSAM simulation done.\n');

%% ------------------------------------------
% Extract states
%% ------------------------------------------
x1 = X(:,1);  x2 = X(:,2);  x3 = X(:,3);
x4 = X(:,4);  x5 = X(:,5);  x6 = X(:,6);
x7 = X(:,7);  x8 = X(:,8);

%% ------------------------------------------
% Reconstruct
%% ------------------------------------------
iL_gssam = x1 + 2*x3.*cos(w*t) - 2*x4.*sin(w*t);
Vc_gssam = x2 + 2*x5.*cos(w*t) - 2*x6.*sin(w*t);

iL_0 = x1;
Vc_0 = x2;

%% ------------------------------------------
% Duty cycle trajectory
%% ------------------------------------------
d_traj = zeros(size(t));
for k = 1:length(t)
    if t(k) < t_step
        Vr_k = Vr_initial;
    else
        Vr_k = Vr_final;
    end
    iL_ref    = Kp1*(Vr_k - X(k,2)) + Ki1*X(k,7);
    vcon0     = Kp2*(iL_ref - X(k,1)) + Ki2*X(k,8);
    d_traj(k) = max(0, min(1, vcon0/Vm));
end

d_ss  = d_traj(end);
a_ss  = sin(2*pi*d_ss)/(2*pi);
b_ss  = (cos(2*pi*d_ss)-1)/(2*pi);

da_dd = cos(2*pi*d_ss);
db_dd = -sin(2*pi*d_ss);

vo0_e_ss = Vin * d_ss / (1 - d_ss);
iL0_e_ss = vo0_e_ss / (R * (1 - d_ss));

A = [
 -Kp2*(Vin+vo0_e_ss)/L,                          -(1-d_ss)/L-Kp2*Kp1*(Vin+vo0_e_ss)/L,                  0,           0,           2*a_ss/L,        2*b_ss/L,        Kp2*Ki1*(Vin+vo0_e_ss)/L,                Ki2*(Vin+vo0_e_ss)/L;
 (1-d_ss)/C+Kp2*iL0_e_ss/C,                       -1/(R*C)+Kp2*Kp1*iL0_e_ss/C,                          -2*a_ss/C,   -2*b_ss/C,   0,               0,               -Kp2*Ki1*iL0_e_ss/C,                     -Ki2*iL0_e_ss/C;
 -Kp2*da_dd*(Vin+vo0_e_ss)/L,                      a_ss/L-Kp2*Kp1*da_dd*(Vin+vo0_e_ss)/L,                0,           w,           -(1-d_ss)/L,     0,               Kp2*Ki1*da_dd*(Vin+vo0_e_ss)/L,           Ki2*da_dd*(Vin+vo0_e_ss)/L;
 -Kp2*db_dd*(Vin+vo0_e_ss)/L,                      b_ss/L-Kp2*Kp1*db_dd*(Vin+vo0_e_ss)/L,               -w,           0,           0,               -(1-d_ss)/L,     Kp2*Ki1*db_dd*(Vin+vo0_e_ss)/L,           Ki2*db_dd*(Vin+vo0_e_ss)/L;
 -a_ss/C+Kp2*da_dd*iL0_e_ss/C,                     Kp2*Kp1*da_dd*iL0_e_ss/C,                             (1-d_ss)/C,  0,           -1/(R*C),        w,               -Kp2*Ki1*da_dd*iL0_e_ss/C,               -Ki2*da_dd*iL0_e_ss/C;
 -b_ss/C+Kp2*db_dd*iL0_e_ss/C,                     Kp2*Kp1*db_dd*iL0_e_ss/C,                             0,           (1-d_ss)/C,  -w,              -1/(R*C),        -Kp2*Ki1*db_dd*iL0_e_ss/C,               -Ki2*db_dd*iL0_e_ss/C;
  0,                                               -1,                                                     0,           0,           0,               0,               0,                                       0;
 -1,                                               -Kp1,                                                   0,           0,           0,               0,               Ki1,                                     0
];

B = [
    Kp2*Kp1*(Vin+vo0_e_ss)/L;
   -Kp2*Kp1*iL0_e_ss/C;
    Kp2*Kp1*da_dd*(Vin+vo0_e_ss)/L;
    Kp2*Kp1*db_dd*(Vin+vo0_e_ss)/L;
   -Kp2*Kp1*da_dd*iL0_e_ss/C;
   -Kp2*Kp1*db_dd*iL0_e_ss/C;
    1;
    Kp1];

C = eye(8);
D = zeros(8,1);

fprintf('\n=== Closed-Loop A Matrix (8x8) ===\n');
disp(A);

fprintf('=== Closed-Loop B Matrix (8x1) ===\n');
disp(B);



%% ==========================================
%  Run Simulink Switching Model
%% ==========================================
fprintf('\nRunning Simulink switching model...\n');
model = 'Buck_Boost_2024V';
load_system(model);
simOut = sim(model);

iL_sw = simOut.y1.Data;
vC_sw = simOut.y2.Data;
t_sw  = simOut.y1.Time;
fprintf('Switching model done.\n');

%% ==========================================
%  Comparison Plots
%% ==========================================
t_gs_ms = t * 1e3;
t_sw_ms = t_sw * 1e3;

figure('Color','w','Position',[100 50 1000 800]);

subplot(2,1,1)
plot(t_sw_ms, iL_sw, 'b', 'LineWidth', 1.0); hold on;
plot(t_gs_ms, iL_gssam, 'r--', 'LineWidth', 1.2);
plot(t_gs_ms, iL_0, 'k', 'LineWidth', 1.5);
grid on;
ylabel('i_L (A)')
title('Inductor Current')
legend('Switching', 'GSSAM (DC + n=\pm1)', 'Zero-order')

subplot(2,1,2)
plot(t_sw_ms, vC_sw, 'b', 'LineWidth', 1.0); hold on;
plot(t_gs_ms, Vc_gssam, 'r--', 'LineWidth', 1.2);
plot(t_gs_ms, Vc_0, 'k', 'LineWidth', 1.5);
grid on;
xlabel('Time (ms)')
ylabel('V_C (V)')
title('Output Voltage')
legend('Switching', 'GSSAM (DC + n=\pm1)', 'Zero-order')

%% Zoomed steady state
figure('Color','w','Position',[100 50 1000 800]);

subplot(2,1,1)
plot(t_sw_ms, iL_sw, 'b', 'LineWidth', 1.0); hold on;
plot(t_gs_ms, iL_gssam, 'r--', 'LineWidth', 1.2);
plot(t_gs_ms, iL_0, 'k', 'LineWidth', 1.5);
grid on;
xlim([72 80])
ylabel('i_L (A)')
title('Inductor Current (Zoomed)')
legend('Switching', 'GSSAM (DC + n=\pm1)', 'Zero-order')

subplot(2,1,2)
plot(t_sw_ms, vC_sw, 'b', 'LineWidth', 1.0); hold on;
plot(t_gs_ms, Vc_gssam, 'r--', 'LineWidth', 1.2);
plot(t_gs_ms, Vc_0, 'k', 'LineWidth', 1.5);
grid on;
xlim([72 80])
xlabel('Time (ms)')
ylabel('V_C (V)')
title('Output Voltage (Zoomed)')
legend('Switching', 'GSSAM (DC + n=\pm1)', 'Zero-order')

%% Duty cycle
figure('Color','w','Position',[100 400 600 300]);
plot(t_gs_ms, d_traj, 'm', 'LineWidth', 1.5);
grid on;
xlabel('Time (ms)')
ylabel('d')
title('Duty Cycle Trajectory')
ylim([0 1.1])

%% ==========================================
%  NONLINEAR ODE FUNCTION – BUCK-BOOST
%  WITH ANTI-WINDUP
%% ==========================================
function dXdt = gssam_buckboost_cl_ode(t, X, p)

    iL0  = X(1);   vo0  = X(2);
    iLR  = X(3);   iLI  = X(4);
    voR  = X(5);   voI  = X(6);
    ev_i = X(7);   ei_i = X(8);

    Vin = p.Vin;  L = p.L;  C = p.C;  R = p.R;
    w   = p.w;    Vm = p.Vm;
    Kp1 = p.Kp1;  Ki1 = p.Ki1;
    Kp2 = p.Kp2;  Ki2 = p.Ki2;

    % Step reference
    if t < p.t_step
        Vr = p.Vr_initial;
    else
        Vr = p.Vr_final;
    end

    % ---- Controller ----
    ev     = Vr - vo0;
    iL_ref = Kp1 * ev + Ki1 * ev_i;
    ei     = iL_ref - iL0;
    vcon0  = Kp2 * ei + Ki2 * ei_i;

    % Duty cycle before saturation
    d_raw = vcon0 / Vm;
    d = max(0, min(1, d_raw));

    % ---- Anti-windup (clamping) ----
    if d_raw > 1 && ei > 0
        dei_i = 0;
    elseif d_raw < 0 && ei < 0
        dei_i = 0;
    else
        dei_i = ei;
    end

    if d_raw > 1 && ev > 0
        dev_i = 0;
    elseif d_raw < 0 && ev < 0
        dev_i = 0;
    else
        dev_i = ev;
    end

    % ---- Fourier coefficients of s ----
    a  = sin(2*pi*d) / (2*pi);
    b  = (cos(2*pi*d) - 1) / (2*pi);

    % ---- Complement (1-s) ----
    q0 = 1 - d;
    qR = -a;
    qI = -b;

    % ---- Product <s*Vin> ----
    sVin_0 = d * Vin;
    sVin_R = a * Vin;
    sVin_I = b * Vin;

    % ---- Product <(1-s)*vo> ----
    qvo_0 = q0*vo0 + 2*(qR*voR + qI*voI);
    qvo_R = q0*voR + qR*vo0;
    qvo_I = q0*voI + qI*vo0;

    % ---- Product <(1-s)*iL> ----
    qiL_0 = q0*iL0 + 2*(qR*iLR + qI*iLI);
    qiL_R = q0*iLR + qR*iL0;
    qiL_I = q0*iLI + qI*iL0;

    % ---- State equations ----
    diL0 = (1/L)*sVin_0 - (1/L)*qvo_0;
    dvo0 = (1/C)*qiL_0 - (1/(R*C))*vo0;

    diLR = (1/L)*sVin_R - (1/L)*qvo_R + w*iLI;
    diLI = (1/L)*sVin_I - (1/L)*qvo_I - w*iLR;

    dvoR = (1/C)*qiL_R - (1/(R*C))*voR + w*voI;
    dvoI = (1/C)*qiL_I - (1/(R*C))*voI - w*voR;

    dXdt = [diL0; dvo0; diLR; diLI; dvoR; dvoI; dev_i; dei_i];
end